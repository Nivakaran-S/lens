import {
  getJob,
  insertDocument,
  listDocumentsForJob,
  updateDocument,
  updateJob,
} from '../db/jobs.js';
import { addCredits } from '../db/users.js';
import { applyRiskRules } from '../domain/risk-rules.js';
import type { DocType } from '../domain/doc-types.js';
import { env } from '../env.js';
import { analyseAll, type DocInput } from '../gemini/analyseAll.js';
import { ensureFreshGeminiFile } from '../gemini/file-store.js';
import { getObjectBuffer, pdfObjectKey, putObject } from '../storage/r2.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';
import { extractPdfsFromZip } from '../zip/extract.js';

/**
 * Background pipeline that runs after a successful upload. Replaces the
 * Inngest analyze-pack workflow with a plain async function — appropriate
 * because Render runs as a long-lived Node process (no per-request timeout
 * to fight) and we now do a single Gemini call per pack instead of 25.
 *
 * Call this fire-and-forget from POST /api/jobs/:id/start. The function
 * returns nothing useful to the caller; it persists progress to MongoDB as
 * it goes, and the frontend polls /api/jobs/:id to see updates.
 *
 * On any error, marks the job 'failed' with the error message saved on
 * `jobs.error`. Does not throw — the caller .catch() is just for log
 * diagnostics.
 */
export async function runAnalysis(jobId: string, logArg?: Logger): Promise<void> {
  const log = logArg ?? fallbackLogger(`analyse:${jobId.slice(0, 8)}`);
  const t0 = Date.now();
  log.info('runAnalysis: start');

  try {
    // ── Step 1: extract PDFs from the ZIP and stage in R2 ──────────────
    const job = await getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await updateJob(jobId, { status: 'extracting', status_detail: 'Extracting PDFs from ZIP' });
    log.info('downloading ZIP from R2', { key: job.zip_storage_key });
    const zipBuffer = await getObjectBuffer(job.zip_storage_key);

    const pdfs = extractPdfsFromZip(zipBuffer);
    if (pdfs.length === 0) throw new Error('ZIP contained no PDFs');
    log.info(`extracted ${pdfs.length} PDFs from ZIP`);

    for (let i = 0; i < pdfs.length; i++) {
      const pdf = pdfs[i]!;
      const key = pdfObjectKey(job.user_id, job.id, i, pdf.filename);
      await putObject(key, pdf.buffer, 'application/pdf');
      await insertDocument({
        job_id: job.id,
        filename: pdf.filename,
        storage_key: key,
        size_bytes: pdf.buffer.length,
      });
    }

    // ── Step 2: upload each PDF to Gemini File API ─────────────────────
    // File API uploads are on a separate quota from generate_content, so we
    // can run these in parallel without rate-limit risk.
    await updateJob(jobId, {
      status: 'extracting',
      status_detail: `Uploading ${pdfs.length} PDFs to Gemini`,
    });
    const docsForUpload = await listDocumentsForJob(jobId);
    await Promise.all(docsForUpload.map((d) => ensureFreshGeminiFile(d)));
    log.info('uploaded all PDFs to Gemini File API');

    // ── Step 3: single Gemini call analysing the whole pack ────────────
    await updateJob(jobId, {
      status: 'analyzing',
      status_detail: `Analysing ${pdfs.length} documents in one Gemini call`,
    });
    const docs = await listDocumentsForJob(jobId);
    const inputs: DocInput[] = [];
    for (const d of docs) {
      const file = await ensureFreshGeminiFile(d); // cached after step 2
      inputs.push({ id: d.id, filename: d.filename, file });
    }

    const tCall = Date.now();
    const result = await analyseAll(inputs);
    log.info(`analyseAll completed in ${Date.now() - tCall}ms`, {
      perDocReturned: result.documents.length,
    });

    // ── Step 4: persist per-doc analysis ───────────────────────────────
    for (const docResult of result.documents) {
      const matching = docs.find((d) => d.filename === docResult.filename);
      if (!matching) {
        log.warn('analyseAll returned a document not in the pack', { filename: docResult.filename });
        continue;
      }
      await updateDocument(matching.id, {
        doc_type: docResult.doc_type as DocType,
        extraction: docResult.extraction,
      });
    }

    // ── Step 5: apply UK-specific deterministic risk rules ─────────────
    const docsForRules = await listDocumentsForJob(jobId);
    const finalReport = applyRiskRules(result.report, docsForRules);

    await updateJob(jobId, {
      status: 'done',
      status_detail: 'Analysis complete',
      report: finalReport,
    });

    log.info(`runAnalysis: done in ${Date.now() - t0}ms`, {
      overall_risk: finalReport.overall_risk,
      risks: finalReport.risks?.length ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`runAnalysis: failed after ${Date.now() - t0}ms`, {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    try {
      await updateJob(jobId, {
        status: 'failed',
        status_detail: 'Analysis failed',
        error: message.slice(0, 1000),
      });
    } catch (persistErr) {
      log.error('failed to persist failed status', {
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }

    // Refund the credit charged on /start so transient failures don't burn
    // the user's balance. We do this best-effort: if the job lookup or
    // refund fails, the failure status is still persisted above.
    try {
      const job = await getJob(jobId);
      if (job) {
        const refund = env().COST_PER_ANALYSIS;
        const result = await addCredits(job.user_id, refund, {
          source: 'refund',
          note: `Refund for failed job ${jobId}`,
        });
        log.info(`refunded ${refund} credit(s); balance=${result.balance}`);
      }
    } catch (refundErr) {
      log.error('refund failed', {
        error: refundErr instanceof Error ? refundErr.message : String(refundErr),
      });
    }
  }
}

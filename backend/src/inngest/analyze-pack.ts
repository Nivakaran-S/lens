import { NonRetriableError } from 'inngest';
import { inngest } from './client.js';
import {
  getJob,
  insertDocument,
  listDocumentsForJob,
  updateDocument,
  updateJob,
} from '../db/jobs.js';
import { getObjectBuffer, pdfObjectKey, putObject } from '../storage/r2.js';
import { extractPdfsFromZip } from '../zip/extract.js';
import { ensureFreshGeminiFile } from '../gemini/file-store.js';
import { analyseAll, type DocInput } from '../gemini/analyseAll.js';
import { applyRiskRules } from '../domain/risk-rules.js';
import type { DocType } from '../domain/doc-types.js';

export const analyzePack = inngest.createFunction(
  {
    id: 'analyze-pack',
    name: 'Analyse legal pack',
    concurrency: { limit: 1 },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const originalJobId = (event as unknown as { data: { event: { data: { jobId: string } } } })
        .data.event.data.jobId;
      const message = error instanceof Error ? error.message : String(error);
      try {
        await updateJob(originalJobId, {
          status: 'failed',
          status_detail: 'Analysis failed',
          error: message.slice(0, 1000),
        });
      } catch (e) {
        console.error('[analyze-pack/onFailure] failed to mark job failed', e);
      }
    },
  },
  { event: 'pack/uploaded' },
  async ({ event, step, logger }) => {
    const { jobId } = event.data;

    // ── Step 1: extract PDFs from the ZIP and stage in R2 ──────────────
    const documents = await step.run('extract', async () => {
      const job = await getJob(jobId);
      if (!job) throw new NonRetriableError(`Job ${jobId} not found`);

      await updateJob(jobId, { status: 'extracting', status_detail: 'Extracting PDFs from ZIP' });

      const zipBuffer = await getObjectBuffer(job.zip_storage_key);
      const pdfs = extractPdfsFromZip(zipBuffer);
      if (pdfs.length === 0) {
        throw new NonRetriableError('ZIP contained no PDFs');
      }

      const inserted: { id: string; filename: string }[] = [];
      for (let i = 0; i < pdfs.length; i++) {
        const pdf = pdfs[i]!;
        const key = pdfObjectKey(job.user_id, job.id, i, pdf.filename);
        await putObject(key, pdf.buffer, 'application/pdf');
        const row = await insertDocument({
          job_id: job.id,
          filename: pdf.filename,
          storage_key: key,
          size_bytes: pdf.buffer.length,
        });
        inserted.push({ id: row.id, filename: pdf.filename });
      }

      logger.info(`Extracted ${inserted.length} PDFs for job ${jobId}`);
      return inserted;
    });

    // ── Step 2: upload each PDF to Gemini File API ─────────────────────
    // File API uploads are on a separate quota from generate_content, so we
    // can run these in parallel without rate-limit risk. Doing this in its
    // own step makes the per-doc upload progress visible if the workflow
    // restarts after a crash.
    await step.run('uploading-status', async () => {
      await updateJob(jobId, {
        status: 'extracting',
        status_detail: `Uploading ${documents.length} PDFs to Gemini`,
      });
    });

    await step.run('upload-to-gemini', async () => {
      const docs = await listDocumentsForJob(jobId);
      // ensureFreshGeminiFile uploads if missing AND updates the doc row
      // with the URI + timestamp. Run in parallel — file API has a higher
      // quota than generate_content.
      await Promise.all(docs.map((d) => ensureFreshGeminiFile(d)));
    });

    // ── Step 3: single Gemini 2.5 Pro call analysing all documents ────
    // One generate_content call instead of 25. Returns per-doc
    // classification + extraction AND the cross-doc synthesis report.
    // See gemini/analyseAll.ts for the system prompt.
    await step.run('analyzing-status', async () => {
      await updateJob(jobId, {
        status: 'analyzing',
        status_detail: `Analysing ${documents.length} documents in one Gemini Pro call`,
      });
    });

    const finalReport = await step.run('analyse-all', async () => {
      const docs = await listDocumentsForJob(jobId);
      const inputs: DocInput[] = [];
      for (const d of docs) {
        const file = await ensureFreshGeminiFile(d); // cached after step 2
        inputs.push({ id: d.id, filename: d.filename, file });
      }

      const result = await analyseAll(inputs);

      // Write per-doc classification + extraction back to MongoDB so the
      // frontend's DocumentList renders them.
      for (const docResult of result.documents) {
        const matching = docs.find((d) => d.filename === docResult.filename);
        if (!matching) {
          logger.warn(`analyseAll returned a document not in the pack`, {
            filename: docResult.filename,
          });
          continue;
        }
        await updateDocument(matching.id, {
          doc_type: docResult.doc_type as DocType,
          extraction: docResult.extraction,
        });
      }

      // Apply the deterministic UK-specific rule layer on top of the
      // model's report (severity bumps for non-absolute title, MEES
      // F/G EPC, probate executor mismatch, etc.).
      const docsForRules = await listDocumentsForJob(jobId);
      const finalised = applyRiskRules(result.report, docsForRules);

      await updateJob(jobId, {
        status: 'done',
        status_detail: 'Analysis complete',
        report: finalised,
      });
      return finalised;
    });

    logger.info(`Analysis complete for job ${jobId}: overall_risk=${finalReport.overall_risk}`);
    return { jobId, documents: documents.length, overall_risk: finalReport.overall_risk };
  },
);

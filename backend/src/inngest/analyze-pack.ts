import { NonRetriableError } from 'inngest';
import { inngest } from './client.js';
import {
  getDocument,
  getJob,
  insertDocument,
  listDocumentsForJob,
  updateDocument,
  updateJob,
} from '../db/jobs.js';
import { getObjectBuffer, pdfObjectKey, putObject } from '../storage/r2.js';
import { extractPdfsFromZip } from '../zip/extract.js';
import { ensureFreshGeminiFile } from '../gemini/file-store.js';
import { classifyDocument } from '../gemini/classify.js';
import { extractDocument } from '../gemini/extract.js';
import { synthesiseReport, type DocumentForSynthesis } from '../gemini/synthesize.js';
import { applyRiskRules, type Report } from '../domain/risk-rules.js';
import type { DocType } from '../domain/doc-types.js';

export const analyzePack = inngest.createFunction(
  {
    id: 'analyze-pack',
    name: 'Analyse legal pack',
    // Free-tier-safe defaults: only one workflow at a time so the
    // process-local Gemini throttle in throttle.ts isn't shared across
    // concurrent runs. retries=5 gives RetryAfterError room when a 429
    // slips past the in-process throttle.
    concurrency: { limit: 1 },
    retries: 5,
    onFailure: async ({ event, error }) => {
      // Inngest passes the original event under event.data.event when a
      // function fails after exhausting retries.
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

    // ── Step 1: extract PDFs from the ZIP and stage in R2 + Gemini ──
    const documents = await step.run('extract', async () => {
      const job = await getJob(jobId);
      if (!job) throw new NonRetriableError(`Job ${jobId} not found`);

      await updateJob(jobId, { status: 'extracting', status_detail: 'Extracting PDFs from ZIP' });

      const zipBuffer = await getObjectBuffer(job.zip_storage_key);
      const pdfs = extractPdfsFromZip(zipBuffer);
      if (pdfs.length === 0) {
        throw new NonRetriableError('ZIP contained no PDFs');
      }

      // Pure ZIP → R2 + insert. NO Gemini calls in this step — those happen
      // per-doc later so the user sees each doc's classification/extraction
      // results pop in incrementally as Gemini works through them.
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

    // ── Step 2: per-doc analysis pipeline (interleaved) ───────────────────
    // For each document, do classify → extract one after the other before
    // moving to the next doc. The frontend polls jobs/:id every 2s and sees
    // each doc's `doc_type` then `extraction` populate one at a time, so
    // the UI shows progress incrementally instead of in two big batches.
    await step.run('analyzing-status', async () => {
      await updateJob(jobId, {
        status: 'analyzing',
        status_detail: `Analyzing 0/${documents.length}`,
      });
    });

    for (let i = 0; i < documents.length; i++) {
      const d = documents[i]!;
      const human = `${i + 1}/${documents.length}: ${d.filename}`;

      await step.run(`progress-classify-${i}`, async () => {
        await updateJob(jobId, {
          status: 'classifying',
          status_detail: `Classifying ${human}`,
        });
      });

      await step.run(`classify-${i}-${d.id}`, async () => {
        const doc = await getDocument(d.id);
        if (!doc) throw new NonRetriableError(`Doc ${d.id} disappeared`);
        const file = await ensureFreshGeminiFile(doc);
        const result = await classifyDocument(file, doc.filename);
        await updateDocument(doc.id, { doc_type: result.doc_type });
        return { id: doc.id, doc_type: result.doc_type };
      });

      await step.run(`progress-extract-${i}`, async () => {
        await updateJob(jobId, {
          status: 'analyzing',
          status_detail: `Extracting ${human}`,
        });
      });

      await step.run(`extract-${i}-${d.id}`, async () => {
        const doc = await getDocument(d.id);
        if (!doc) throw new NonRetriableError(`Doc ${d.id} disappeared`);
        if (!doc.doc_type) throw new NonRetriableError(`Doc ${d.id} missing doc_type after classify`);
        const file = await ensureFreshGeminiFile(doc);
        const extraction = await extractDocument(doc.doc_type as DocType, file, doc.filename);
        await updateDocument(doc.id, { extraction });
        return { id: doc.id };
      });
    }

    // ── Step 4: cross-document synthesis (Gemini 2.5 Pro) ─────────────────
    await step.run('synthesizing-status', async () => {
      await updateJob(jobId, {
        status: 'synthesizing',
        status_detail: 'Cross-referencing findings across the pack',
      });
    });

    const finalReport = await step.run('synthesize', async () => {
      const docs = await listDocumentsForJob(jobId);
      const forSynthesis: DocumentForSynthesis[] = [];
      for (const d of docs) {
        if (!d.doc_type) continue;
        const file = await ensureFreshGeminiFile(d);
        forSynthesis.push({
          filename: d.filename,
          doc_type: d.doc_type as DocType,
          extraction: d.extraction,
          file,
        });
      }

      const modelReport: Report = await synthesiseReport(forSynthesis);
      const finalised = applyRiskRules(modelReport, docs);

      await updateJob(jobId, {
        status: 'done',
        status_detail: 'Analysis complete',
        report: finalised,
      });
      return finalised;
    });

    logger.info(`Synthesis complete for job ${jobId}: overall_risk=${finalReport.overall_risk}`);
    return { jobId, documents: documents.length, overall_risk: finalReport.overall_risk };
  },
);

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
import { STORAGE_BUCKET, docStoragePath, supabaseAdmin } from '../db/supabase.js';
import { extractPdfsFromZip } from '../zip/extract.js';
import { ensureFreshGeminiFile, uploadPdfToGemini } from '../gemini/file-store.js';
import { classifyDocument } from '../gemini/classify.js';
import { extractDocument } from '../gemini/extract.js';
import { synthesiseReport, type DocumentForSynthesis } from '../gemini/synthesize.js';
import { applyRiskRules, type Report } from '../domain/risk-rules.js';
import type { DocType } from '../domain/doc-types.js';

export const analyzePack = inngest.createFunction(
  {
    id: 'analyze-pack',
    name: 'Analyse legal pack',
    concurrency: { limit: 4 },
    retries: 2,
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

    // ── Step 1: extract PDFs from the ZIP and stage in Storage + Gemini ──
    const documents = await step.run('extract', async () => {
      const job = await getJob(jobId);
      if (!job) throw new NonRetriableError(`Job ${jobId} not found`);

      await updateJob(jobId, { status: 'extracting', status_detail: 'Extracting PDFs from ZIP' });

      const sb = supabaseAdmin();
      const { data: zipBlob, error: dlErr } = await sb.storage
        .from(STORAGE_BUCKET)
        .download(job.zip_storage_path);
      if (dlErr || !zipBlob) throw new NonRetriableError(`ZIP download failed: ${dlErr?.message ?? 'no data'}`);

      const zipBuffer = Buffer.from(await zipBlob.arrayBuffer());
      const pdfs = extractPdfsFromZip(zipBuffer);
      if (pdfs.length === 0) {
        throw new NonRetriableError('ZIP contained no PDFs');
      }

      const inserted: { id: string; filename: string }[] = [];
      for (let i = 0; i < pdfs.length; i++) {
        const pdf = pdfs[i]!;
        const path = docStoragePath(job.user_id, job.id, i, pdf.filename);

        const { error: upErr } = await sb.storage
          .from(STORAGE_BUCKET)
          .upload(path, pdf.buffer, { contentType: 'application/pdf', upsert: true });
        if (upErr) throw new Error(`Storage upload failed for ${pdf.filename}: ${upErr.message}`);

        const ref = await uploadPdfToGemini(pdf.buffer, pdf.filename);

        const row = await insertDocument({
          job_id: job.id,
          filename: pdf.filename,
          storage_path: path,
          size_bytes: pdf.buffer.length,
        });
        await updateDocument(row.id, {
          gemini_file_uri: ref.uri,
          gemini_file_uploaded_at: new Date().toISOString(),
        });

        inserted.push({ id: row.id, filename: pdf.filename });
      }

      logger.info(`Extracted ${inserted.length} PDFs for job ${jobId}`);
      return inserted;
    });

    // ── Step 2: classify each document (in parallel) ──────────────────────
    await step.run('classify-status', async () => {
      await updateJob(jobId, {
        status: 'classifying',
        status_detail: `Classifying ${documents.length} document${documents.length === 1 ? '' : 's'}`,
      });
    });

    await Promise.all(
      documents.map((d, i) =>
        step.run(`classify-${i}-${d.id}`, async () => {
          const doc = await getDocument(d.id);
          if (!doc) throw new NonRetriableError(`Doc ${d.id} disappeared`);
          const file = await ensureFreshGeminiFile(doc);
          const result = await classifyDocument(file, doc.filename);
          await updateDocument(doc.id, { doc_type: result.doc_type });
          return { id: doc.id, doc_type: result.doc_type };
        }),
      ),
    );

    // ── Step 3: per-document structured extraction (in parallel) ──────────
    await step.run('analyzing-status', async () => {
      await updateJob(jobId, {
        status: 'analyzing',
        status_detail: `Analyzing ${documents.length} document${documents.length === 1 ? '' : 's'}`,
      });
    });

    const docsForExtract = await step.run('reload-docs', async () => listDocumentsForJob(jobId));

    await Promise.all(
      docsForExtract.map((d, i) =>
        step.run(`extract-${i}-${d.id}`, async () => {
          if (!d.doc_type) {
            throw new NonRetriableError(`Doc ${d.id} missing doc_type after classify`);
          }
          const file = await ensureFreshGeminiFile(d);
          const extraction = await extractDocument(d.doc_type as DocType, file, d.filename);
          await updateDocument(d.id, { extraction });
          return { id: d.id };
        }),
      ),
    );

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

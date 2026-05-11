'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { ApiError, api } from '../../../lib/api';

const MAX_BYTES = 100 * 1024 * 1024;

type Stage = 'idle' | 'creating' | 'uploading' | 'starting' | 'error';

export default function UploadPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      setError(null);
      setProgress(0);
      setFilename(file.name);

      if (file.size > MAX_BYTES) {
        setError(`File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
        setStage('error');
        return;
      }

      try {
        setStage('creating');
        const created = await api.createJob(file.name, file.size);

        setStage('uploading');
        // POST multipart to our backend. uploadJobFile handles auth + progress.
        await api.uploadJobFile(created.jobId, file, setProgress);
        setProgress(100);

        setStage('starting');
        try {
          await api.startJob(created.jobId);
        } catch (startErr) {
          // 402 = insufficient credits → bounce to /billing
          if (startErr instanceof ApiError && startErr.status === 402) {
            router.push(`/billing?reason=insufficient&job=${created.jobId}`);
            return;
          }
          throw startErr;
        }

        router.push(`/jobs/${created.jobId}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        setError(msg);
        setStage('error');
      }
    },
    [router],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] },
    maxFiles: 1,
    multiple: false,
    disabled: stage === 'creating' || stage === 'uploading' || stage === 'starting',
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analyse a legal pack</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Drop a ZIP containing the auction legal pack PDFs (title, searches, TA forms, EPC, special
          conditions). Max {Math.round(MAX_BYTES / 1024 / 1024)} MB.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>How we process your upload:</strong> documents are sent to Google&apos;s Gemini AI
        for analysis. Files and reports are deleted 90 days after analysis completes — or sooner
        if you delete your account. By uploading you confirm you have the right to share the
        documents and accept that the output is informational only, not legal advice.{' '}
        <a href="/privacy" target="_blank" className="underline">
          Privacy
        </a>{' '}
        ·{' '}
        <a href="/terms" target="_blank" className="underline">
          Terms
        </a>
      </div>

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          isDragActive
            ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900'
            : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-10 w-10 text-zinc-400" aria-hidden />
        <p className="text-sm font-medium">
          {isDragActive ? 'Drop it here' : 'Drag a ZIP here, or click to browse'}
        </p>
        <p className="text-xs text-zinc-500">.zip only</p>
      </div>

      {filename && (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm font-medium">{filename}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {stage === 'creating' && 'Creating job…'}
            {stage === 'uploading' && `Uploading… ${progress}%`}
            {stage === 'starting' && 'Queueing for analysis…'}
            {stage === 'error' && error}
          </p>
          {(stage === 'uploading' || stage === 'creating' || stage === 'starting') && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
                style={{ width: stage === 'uploading' ? `${progress}%` : stage === 'starting' ? '100%' : '20%' }}
              />
            </div>
          )}
        </div>
      )}

      {error && stage === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

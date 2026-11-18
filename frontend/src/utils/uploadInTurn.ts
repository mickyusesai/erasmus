/**
 * An organiser adding several files for one participant: they go up one after another, so
 * progress can be shown and one refused file doesn't stop the rest.
 */
import toast from 'react-hot-toast';
import { organisationApi } from '../services/api';
import { uploadErrorMessage } from './uploadErrors';

export interface UploadRun {
  added: number;
  alreadyThere: string[];
  failed: { name: string; reason: string }[];
}

export async function uploadForParticipantInTurn(
  participantId: string,
  files: File[],
  documentType: string,
  onProgress: (current: number, total: number) => void
): Promise<UploadRun> {
  const run: UploadRun = { added: 0, alreadyThere: [], failed: [] };
  for (let i = 0; i < files.length; i++) {
    onProgress(i + 1, files.length);
    try {
      const doc = await organisationApi.uploadDocument(participantId, files[i], documentType);
      if (doc.duplicate) run.alreadyThere.push(files[i].name);
      else run.added++;
    } catch (err) {
      run.failed.push({ name: files[i].name, reason: uploadErrorMessage(err, `"${files[i].name}" could not be uploaded.`) });
    }
  }
  return run;
}

/** Tells the organiser what happened; `one`/`many` name the files ("receipt"/"receipts") */
export function reportUploadRun(run: UploadRun, one: string, many: string, afterAdded = ''): void {
  if (run.added > 0) {
    toast.success(`${run.added} ${run.added === 1 ? one : many} added${afterAdded}`);
  }
  if (run.alreadyThere.length > 0) {
    toast(
      run.alreadyThere.length === 1
        ? `"${run.alreadyThere[0]}" is already in this participant's documents, so it was not added twice`
        : `${run.alreadyThere.length} files were already in this participant's documents, so they were not added twice`,
      { icon: 'ℹ️', duration: 6000 }
    );
  }
  if (run.failed.length > 0) {
    toast.error(
      run.failed.length === 1 ? run.failed[0].reason : `${run.failed.length} files could not be uploaded. ${run.failed[0].reason}`,
      { duration: 10000 }
    );
  }
}

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, FileUp, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { organisationApi, type ImportPreview } from '../../services/api';
import { Button } from '../ui/Button';

/** The list as the organiser gave it: pasted text, or a file from their computer */
type Source = { kind: 'text'; text: string } | { kind: 'file'; file: File };

const EXAMPLE = `Anna Nowak, anna@example.org, Poland
Marco Bianchi, marco@example.org, Italy`;

/**
 * Add participants by pasting a list: rows copied from a sheet, lines from a message, or the
 * "To" line of an email. No header row is needed; what was recognised is shown before
 * anything is added. A CSV file can be chosen instead and goes the same way.
 */
export function PasteParticipants({
  projectId,
  onAdded,
  addLabel = (count: number) => `Add ${count} participant${count === 1 ? '' : 's'}`,
}: {
  projectId: string;
  /** Called after participants were added, with how many */
  onAdded: (created: number) => void;
  addLabel?: (count: number) => string;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [country, setCountry] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  const source: Source | null = file ? { kind: 'file', file } : text.trim() ? { kind: 'text', text } : null;

  // What is recognised is shown while typing or pasting, a moment after the last change
  useEffect(() => {
    if (!source) {
      setPreview(null);
      setProblem(null);
      return;
    }
    const run = ++latest.current;
    setChecking(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const result =
            source.kind === 'file'
              ? await organisationApi.previewImport(projectId, source.file)
              : await organisationApi.previewPastedParticipants(projectId, source.text, country.trim());
          if (run !== latest.current) return;
          setPreview(result);
          setProblem(null);
        } catch (err) {
          if (run !== latest.current) return;
          setPreview(null);
          setProblem(err instanceof Error && err.message ? err.message : 'The list could not be read.');
        } finally {
          if (run === latest.current) setChecking(false);
        }
      },
      source.kind === 'file' ? 0 : 500
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, file, country, projectId]);

  const missing = preview?.missingColumns ?? [];
  const onlyCountryMissing = missing.length === 1 && missing[0] === 'country';
  const full = preview?.remainingSlots != null && preview.totalRows > preview.remainingSlots;
  const canAdd = !!preview && preview.totalRows > 0 && missing.length === 0 && !full && !checking;

  const add = async () => {
    if (!source || !canAdd) return;
    setAdding(true);
    try {
      const result =
        source.kind === 'file'
          ? await organisationApi.importParticipants(projectId, source.file)
          : await organisationApi.importPastedParticipants(projectId, source.text, country.trim());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['org-participants', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['org-country-limits', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['org-project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }),
      ]);
      toast.success(`Added ${result.created} participant${result.created === 1 ? '' : 's'}`);
      setText('');
      setFile(null);
      setPreview(null);
      onAdded(result.created);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'The participants could not be added');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4" data-paste-participants>
      {file ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-800 truncate">
            <FileUp className="w-4 h-4 inline-block mr-2 text-gray-500" />
            {file.name}
          </p>
          <button type="button" onClick={() => setFile(null)} className="text-sm text-primary-600 hover:text-primary-700 font-medium flex-shrink-0">
            Paste a list instead
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor="paste-list" className="block text-sm font-medium text-gray-700 mb-1">
            Paste your list
          </label>
          <textarea
            id="paste-list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={EXAMPLE}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            One participant per line: name, email and sending country, in any order. Copy the rows straight from your sheet, or the addresses from an
            email.{' '}
            <button type="button" onClick={() => fileInput.current?.click()} className="text-primary-600 hover:text-primary-700 font-medium">
              Or choose a CSV file
            </button>
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* A list of one partner's participants often has no country: one for all of them */}
      {!file && (onlyCountryMissing || country) && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
          <label htmlFor="paste-country" className="block text-sm font-medium text-amber-900">
            Which country do they travel from?
          </label>
          <p className="text-xs text-amber-800 mt-0.5">Your list has no country. Fill in one for all of them; lists per country can be added one after the other.</p>
          <input
            id="paste-country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. Italy"
            className="mt-2 w-full sm:w-64 px-3 py-2 rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      )}

      {checking && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Reading the list…
        </p>
      )}

      {problem && !checking && (
        <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {problem}
        </p>
      )}

      {preview && !checking && missing.length > 0 && !(onlyCountryMissing && !file) && (
        <p className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            I can't find the {missing.join(', ')} in this list. Every participant needs a name, an email address and a sending country.
          </span>
        </p>
      )}

      {preview && !checking && missing.length === 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              {preview.totalRows === 0 ? 'Nobody new in this list' : `${preview.totalRows} participant${preview.totalRows === 1 ? '' : 's'} recognised`}
            </p>
            {!!preview.alreadyInProject && (
              <p className="text-xs text-gray-500">
                {preview.alreadyInProject} already in the project (left out)
              </p>
            )}
          </div>
          {preview.preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2">First name</th>
                    <th className="px-4 py-2">Last name</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.preview.map((row) => (
                    <tr key={row.email}>
                      <td className="px-4 py-2 text-gray-900">{row.firstName}</td>
                      <td className="px-4 py-2 text-gray-900">{row.lastName}</td>
                      <td className="px-4 py-2 text-gray-600">{row.email}</td>
                      <td className="px-4 py-2 text-gray-600">{row.country}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.totalRows > preview.preview.length && (
            <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">…and {preview.totalRows - preview.preview.length} more</p>
          )}
          {!!preview.skipped?.length && (
            <div className="px-4 py-3 border-t border-gray-200 bg-amber-50">
              <p className="text-sm font-medium text-amber-900">
                {preview.skippedCount ?? preview.skipped.length} line{(preview.skippedCount ?? preview.skipped.length) === 1 ? '' : 's'} left out
              </p>
              <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
                {preview.skipped.slice(0, 5).map((s) => (
                  <li key={s.row}>
                    Line {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {full && (
            <p className="px-4 py-3 border-t border-gray-200 bg-red-50 text-sm text-red-700">
              This project has room for {preview.remainingSlots} more participant{preview.remainingSlots === 1 ? '' : 's'}, and the list has{' '}
              {preview.totalRows}.{' '}
              {preview.isTestProject ? 'Upgrade the free project with a credit, or add fewer.' : 'Expand the project with a credit, or add fewer.'}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={add} loading={adding} disabled={!canAdd}>
          {addLabel(preview && missing.length === 0 ? preview.totalRows : 0)}
        </Button>
      </div>
    </div>
  );
}

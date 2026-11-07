import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Code2, Copy, Database, Layers, Loader2, Sparkles } from 'lucide-react';
import { ipc } from '../../lib/ipc';

export type AssistantTab = 'coding' | 'sql' | 'system_design';

export function AssistantsPage({ initialTab = 'coding' }: { initialTab?: AssistantTab }) {
  const [tab, setTab] = useState<AssistantTab>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Coding Assistant state
  const [codingProblem, setCodingProblem] = useState('');
  const [codingLang, setCodingLang] = useState('TypeScript');
  const [codingAttempt, setCodingAttempt] = useState('');
  const [codingBusy, setCodingBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [codingResult, setCodingResult] = useState<any>(null);

  // SQL Assistant state
  const [sqlQuestion, setSqlQuestion] = useState('');
  const [sqlDialect, setSqlDialect] = useState('PostgreSQL');
  const [sqlSchema, setSqlSchema] = useState('');
  const [sqlBusy, setSqlBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sqlResult, setSqlResult] = useState<any>(null);

  // System Design Assistant state
  const [sdPrompt, setSdPrompt] = useState('');
  const [sdScale, setSdScale] = useState('High-Growth (10M+ DAU)');
  const [sdFocus, setSdFocus] = useState('');
  const [sdBusy, setSdBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sdResult, setSdResult] = useState<any>(null);

  const [error, setError] = useState<string | null>(null);

  const runCoding = async () => {
    if (codingProblem.trim().length < 10) return;
    setCodingBusy(true);
    setError(null);
    try {
      const res = await ipc.careerApiPost('/api/career/assistants/coding', {
        problemStatement: codingProblem,
        language: codingLang,
        candidateAttempt: codingAttempt || undefined,
      });
      setCodingResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCodingBusy(false);
    }
  };

  const runSql = async () => {
    if (sqlQuestion.trim().length < 10) return;
    setSqlBusy(true);
    setError(null);
    try {
      const res = await ipc.careerApiPost('/api/career/assistants/sql', {
        question: sqlQuestion,
        dialect: sqlDialect,
        schemaContext: sqlSchema || undefined,
      });
      setSqlResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSqlBusy(false);
    }
  };

  const runSystemDesign = async () => {
    if (sdPrompt.trim().length < 10) return;
    setSdBusy(true);
    setError(null);
    try {
      const res = await ipc.careerApiPost('/api/career/assistants/system-design', {
        prompt: sdPrompt,
        scaleLevel: sdScale,
        focusAreas: sdFocus || undefined,
      });
      setSdResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSdBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Technical Interview Assistants</h1>
          <p className="muted mt-1 max-w-2xl">
            Specialized AI copilots for Coding &amp; Algorithms, SQL &amp; Data Engineering, and Distributed System
            Design interviews.
          </p>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          {(
            [
              ['coding', 'Coding Assistant', Code2],
              ['sql', 'SQL Assistant', Database],
              ['system_design', 'System Design', Layers],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === id ? 'bg-[var(--color-accent)] text-black' : 'muted hover:text-[var(--text)]'
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* A. CODING INTERVIEW ASSISTANT */}
      {tab === 'coding' && (
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Coding Problem Statement</h2>
              <select className="field w-40 py-1 text-xs" value={codingLang} onChange={(e) => setCodingLang(e.target.value)}>
                {['TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'C#', 'JavaScript'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="field min-h-28 text-sm"
              placeholder="Paste the coding problem statement, input/output examples, or constraints (e.g. LRU Cache, Merge K Sorted Lists, Rate Limiter)..."
              value={codingProblem}
              onChange={(e) => setCodingProblem(e.target.value)}
            />
            <textarea
              className="field min-h-20 font-mono text-xs"
              placeholder="Optional: Paste your current starter code or attempt for review..."
              value={codingAttempt}
              onChange={(e) => setCodingAttempt(e.target.value)}
            />
            <div>
              <button
                className="btn btn-primary"
                disabled={codingBusy || codingProblem.trim().length < 10}
                onClick={runCoding}
              >
                {codingBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {codingBusy ? 'Solving & Analyzing Complexity…' : 'Generate Solution & Complexity Breakdown'}
              </button>
            </div>
          </section>

          {codingResult && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Problem Breakdown</h3>
                  <p className="muted mt-1 text-xs leading-relaxed">{codingResult.problemExplanation}</p>
                  {codingResult.clarifyingQuestions?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-accent">Clarifying Questions to Ask Interviewer</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                        {codingResult.clarifyingQuestions.map((q: string, i: number) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="card flex flex-col gap-3 p-5">
                  <div>
                    <div className="text-xs font-semibold text-amber-400">Brute-Force Approach</div>
                    <p className="muted mt-0.5 text-xs">{codingResult.bruteForceApproach?.summary}</p>
                    <div className="mt-1 font-mono text-[11px]">
                      Time: {codingResult.bruteForceApproach?.timeComplexity} · Space:{' '}
                      {codingResult.bruteForceApproach?.spaceComplexity}
                    </div>
                  </div>
                  <div className="border-t border-[var(--border)] pt-2.5">
                    <div className="text-xs font-semibold text-emerald-400">
                      Optimized Approach ({codingResult.optimizedApproach?.algorithmPattern})
                    </div>
                    <p className="muted mt-0.5 text-xs">{codingResult.optimizedApproach?.summary}</p>
                    <div className="mt-1 font-mono text-[11px] text-accent">
                      Time: {codingResult.optimizedApproach?.timeComplexity} · Space:{' '}
                      {codingResult.optimizedApproach?.spaceComplexity}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Solution ({codingResult.language})</h3>
                  <button
                    className="btn py-1 text-xs"
                    onClick={() => navigator.clipboard.writeText(codingResult.codeSolution || '')}
                  >
                    <Copy size={12} /> Copy Code
                  </button>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/40 p-4 font-mono text-xs leading-relaxed">
                  {codingResult.codeSolution}
                </pre>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Step-by-Step Walkthrough &amp; Edge Cases</h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">
                    {codingResult.stepByStepWalkthrough?.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  {codingResult.edgeCases?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-amber-400">Edge Cases to Cover</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                        {codingResult.edgeCases.map((e: string, i: number) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Test Cases</h3>
                  <div className="mt-2 divide-y divide-[var(--border)] text-xs">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {codingResult.testCases?.map((tc: any, i: number) => (
                      <div key={i} className="py-2">
                        <div className="font-semibold">{tc.name}</div>
                        <div className="font-mono text-[11px] text-accent">Input: {tc.input}</div>
                        <div className="font-mono text-[11px] text-emerald-400">Expected: {tc.expectedOutput}</div>
                        <div className="muted mt-0.5">{tc.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* B. SQL INTERVIEW ASSISTANT */}
      {tab === 'sql' && (
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">SQL Query &amp; Optimization Prompt</h2>
              <select className="field w-44 py-1 text-xs" value={sqlDialect} onChange={(e) => setSqlDialect(e.target.value)}>
                {['PostgreSQL', 'MySQL', 'Snowflake', 'BigQuery', 'SQLite', 'SQL Server'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="field min-h-24 text-sm"
              placeholder="Describe the SQL question (e.g. Find top 3 highest-earning employees per department, 7-day rolling retention, or optimize a slow join)..."
              value={sqlQuestion}
              onChange={(e) => setSqlQuestion(e.target.value)}
            />
            <textarea
              className="field min-h-20 font-mono text-xs"
              placeholder="Optional: Paste table DDL / schema or an existing SQL query to optimize..."
              value={sqlSchema}
              onChange={(e) => setSqlSchema(e.target.value)}
            />
            <div>
              <button className="btn btn-primary" disabled={sqlBusy || sqlQuestion.trim().length < 10} onClick={runSql}>
                {sqlBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {sqlBusy ? 'Writing & Optimizing SQL…' : 'Generate SQL Query & Indexing Plan'}
              </button>
            </div>
          </section>

          {sqlResult && (
            <div className="flex flex-col gap-4">
              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Optimized SQL ({sqlResult.dialect})</h3>
                  <button
                    className="btn py-1 text-xs"
                    onClick={() => navigator.clipboard.writeText(sqlResult.sqlQuery || '')}
                  >
                    <Copy size={12} /> Copy SQL
                  </button>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/40 p-4 font-mono text-xs leading-relaxed">
                  {sqlResult.sqlQuery}
                </pre>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sqlResult.conceptsUsed?.map((c: string) => (
                    <span key={c} className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs text-accent">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Query Walkthrough</h3>
                  <p className="muted mt-1 text-xs">{sqlResult.queryExplanation}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">
                    {sqlResult.stepByStepBreakdown?.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Indexing &amp; Query Optimization</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                    {sqlResult.optimizationTips?.map((t: string, i: number) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  {sqlResult.recommendedIndexes?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-emerald-400">Recommended Indexes</div>
                      {sqlResult.recommendedIndexes.map((idx: string, i: number) => (
                        <pre key={i} className="mt-1 rounded bg-black/30 p-2 font-mono text-[11px]">
                          {idx}
                        </pre>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* C. SYSTEM DESIGN ASSISTANT */}
      {tab === 'system_design' && (
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">System Design Prompt</h2>
              <select className="field w-56 py-1 text-xs" value={sdScale} onChange={(e) => setSdScale(e.target.value)}>
                <option value="Startup / Mid-Scale">Startup / Mid-Scale</option>
                <option value="High-Growth (10M+ DAU)">High-Growth (10M+ DAU)</option>
                <option value="Planet-Scale (100M+ DAU)">Planet-Scale (100M+ DAU)</option>
              </select>
            </div>
            <textarea
              className="field min-h-24 text-sm"
              placeholder="e.g. Design a real-time notification system, Design WhatsApp / Slack, Design a distributed rate limiter, Design YouTube video streaming..."
              value={sdPrompt}
              onChange={(e) => setSdPrompt(e.target.value)}
            />
            <input
              className="field text-xs"
              placeholder="Optional focus areas (e.g. emphasize multi-region replication, Kafka partitioning, or low latency)"
              value={sdFocus}
              onChange={(e) => setSdFocus(e.target.value)}
            />
            <div>
              <button
                className="btn btn-primary"
                disabled={sdBusy || sdPrompt.trim().length < 10}
                onClick={runSystemDesign}
              >
                {sdBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {sdBusy ? 'Architecting System Blueprint…' : 'Generate Complete System Design Blueprint'}
              </button>
            </div>
          </section>

          {sdResult && (
            <div className="flex flex-col gap-4">
              <div className="card p-5">
                <h3 className="text-base font-semibold">{sdResult.systemTitle}</h3>
                <p className="muted mt-1 text-xs">{sdResult.executiveSummary}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-accent">Functional Requirements</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                      {sdResult.functionalRequirements?.map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-400">Non-Functional &amp; Scale Estimates</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                      {sdResult.nonFunctionalRequirements?.map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                      {sdResult.capacityEstimation?.map((c: string, i: number) => (
                        <li key={`cap-${i}`} className="font-mono text-[11px]">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold">High-Level Architecture Diagram</h3>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/40 p-4 font-mono text-xs leading-snug text-accent">
                  {sdResult.architectureDiagramAscii}
                </pre>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">API Design Contracts</h3>
                  <div className="mt-2 divide-y divide-[var(--border)] text-xs">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {sdResult.apiDesign?.map((api: any, i: number) => (
                      <div key={i} className="py-2">
                        <div className="font-mono font-semibold text-accent">
                          {api.method} {api.endpoint}
                        </div>
                        <div>{api.purpose}</div>
                        <div className="muted mt-0.5 text-[11px]">{api.requestResponseSummary}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Database Schema &amp; Partitioning</h3>
                  <div className="mt-2 divide-y divide-[var(--border)] text-xs">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {sdResult.databaseSchema?.map((db: any, i: number) => (
                      <div key={i} className="py-2">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{db.tableOrCollection}</span>
                          <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px]">
                            {db.storageEngine}
                          </span>
                        </div>
                        <div className="muted mt-0.5 text-[11px]">{db.keyFieldsAndPartitioning}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Scalability, Caching, Queues &amp; Reliability</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                    {sdResult.scalabilityAndCaching?.map((s: string, i: number) => (
                      <li key={`sc-${i}`}>{s}</li>
                    ))}
                    {sdResult.queuesAndAsyncProcessing?.map((q: string, i: number) => (
                      <li key={`q-${i}`}>{q}</li>
                    ))}
                    {sdResult.reliabilityAndSecurity?.map((r: string, i: number) => (
                      <li key={`rel-${i}`}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Architectural Trade-Offs</h3>
                  <div className="mt-2 divide-y divide-[var(--border)] text-xs">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {sdResult.keyTradeOffs?.map((t: any, i: number) => (
                      <div key={i} className="py-2">
                        <div className="font-semibold">{t.decision}</div>
                        <div className="mt-0.5 text-emerald-400">+ Pros: {t.pros}</div>
                        <div className="text-amber-400">− Cons: {t.cons}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

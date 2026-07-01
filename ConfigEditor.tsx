import { useEffect, useState } from 'react'
import { X, Loader2, Plus, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useTreeStore } from '@/stores/treeStore'
import { setConfig as postConfig, getColumnValues, derivePeriods } from '@/api/data'
import { buildTree } from '@/api/tree'
import type { MonthlyUploadMeta, LoadedPeriod } from '@/api/data'
import type { Config, RuleCondition } from '@/types/config'
import type { UploadMeta } from '@/types/tree'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid mb-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-500 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex justify-end">{children}</div>
    </div>
  )
}

const inputCls =
  'w-full text-[11px] rounded border border-gray-200 bg-white px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400'

function FilterEditor({
  meta,
  sessionId,
  config,
  onChange,
}: {
  meta: UploadMeta | null
  sessionId: string | null
  config: Config
  onChange: (c: Config) => void
}) {
  const [openCol, setOpenCol] = useState<string | null>(null)
  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const filters = config.data.filters ?? {}
  // Only fields *outside* the selected hierarchy can be filtered on — hierarchy
  // levels are the breakdown axes, not filter targets.
  const hierarchy = config.data.hierarchy
  const catCols = meta
    ? Object.entries(meta.suggestions)
        .filter(([, s]) => s === 'categorical' || s === 'text')
        .map(([c]) => c)
        .filter((c) => !hierarchy.includes(c))
    : []
  const addable = catCols.filter((c) => !(c in filters) && c !== openCol)

  useEffect(() => {
    if (!openCol || !sessionId) return
    setLoading(true)
    setErr(null)
    getColumnValues(sessionId, openCol)
      .then(setValues)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load values'))
      .finally(() => setLoading(false))
  }, [openCol, sessionId])

  function setFilter(col: string, vals: string[] | null) {
    const next = { ...filters }
    if (vals === null) delete next[col]
    else next[col] = vals
    onChange({
      ...config,
      data: { ...config.data, filters: Object.keys(next).length ? next : undefined },
    })
  }

  function toggleVal(val: string) {
    if (!openCol) return
    const current = filters[openCol] ?? values
    const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val]
    if (next.length === values.length) setFilter(openCol, null)
    else setFilter(openCol, next)
  }

  // A newly added column isn't stored in `filters` until a value is deselected
  // (all-selected == no filter == absent). Still render the open column so its
  // checkbox list shows and the first deselection can persist a real subset.
  const displayCols =
    openCol && !(openCol in filters) ? [...Object.keys(filters), openCol] : Object.keys(filters)

  return (
    <div className="space-y-1.5">
      {displayCols.map((col) => {
        const vals = filters[col]
        const isOpen = openCol === col
        return (
          <div key={col} className="rounded border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-1 px-2 py-1">
              <button
                onClick={() => setOpenCol(isOpen ? null : col)}
                className="flex-1 flex items-center gap-1 text-[11px] text-left min-w-0"
              >
                {isOpen ? <ChevronUp className="h-3 w-3 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 flex-shrink-0" />}
                <span className="font-medium text-gray-700 truncate">{col}</span>
                <span className="text-gray-400 text-[10px] flex-shrink-0">
                  {!vals ? 'all values' : vals.length === 0 ? 'none' : vals.length === 1 ? vals[0] : `${vals.length} values`}
                </span>
              </button>
              <button
                onClick={() => {
                  setFilter(col, null)
                  if (openCol === col) setOpenCol(null)
                }}
                className="text-gray-400 hover:text-red-500 flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {isOpen && (
              <div className="border-t border-gray-100">
                <div className="flex gap-2 px-2 py-0.5 border-b border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setFilter(col, null)}
                    className="text-[10px] text-blue-500 hover:text-blue-700"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setFilter(col, [])}
                    className="text-[10px] text-blue-500 hover:text-blue-700"
                  >
                    Deselect all
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto">
                {err && (
                  <div className="flex items-center gap-1 text-red-600 text-[10px] px-2 py-1.5">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" /> {err}
                  </div>
                )}
                {loading ? (
                  <div className="flex items-center justify-center py-2 text-gray-400 text-[10px]">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" /> Loading…
                  </div>
                ) : (
                  values.map((v) => {
                    const checked = (filters[col] ?? values).includes(v)
                    return (
                      <label
                        key={v}
                        className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[11px] hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVal(v)}
                          className="accent-blue-600"
                        />
                        <span className={checked ? 'text-gray-700' : 'text-gray-400 line-through'}>{v}</span>
                      </label>
                    )
                  })
                )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {adding ? (
        <div className="flex items-center gap-1">
          <select
            autoFocus
            className={inputCls}
            value=""
            onChange={(e) => {
              if (e.target.value) setOpenCol(e.target.value)
              setAdding(false)
            }}
            onBlur={() => setAdding(false)}
          >
            <option value="">Choose column…</option>
            {addable.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ) : (
        addable.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add filter
          </button>
        )
      )}
    </div>
  )
}

/**
 * Editable view of the active config item: data, comparison, rules and
 * narrative settings, plus Apply (rebuild) and Generate commentary. Bound to the
 * live working stores, which the saved-sessions store hydrates from whichever
 * tree tab is active. Embedded under the TreeTabs strip in the right panel.
 */
export function ConfigEditor() {
  const { tree, setTree, setBuilding } = useTreeStore()
  const { sessionId, uploadMeta } = useSessionStore()
  const { config, setConfig: updateConfig, isDirty, markClean } = useConfigStore()
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [rebuildErr, setRebuildErr] = useState<string | null>(null)
  const [derivedPeriods, setDerivedPeriods] = useState<LoadedPeriod[]>([])

  // Clear a stale rebuild error whenever the active backend session changes.
  const activeSid = sessionId ?? tree?.session_id ?? null
  useEffect(() => {
    setRebuildErr(null)
  }, [activeSid])

  // Derive the periods available on the session's date column so Current/Prior
  // are real dropdowns. Auto-suggest a current/prior pair if none is chosen yet.
  const dateColForPeriods = config.data.date_col
  const granularityForPeriods = config.comparison.granularity ?? 'month'
  useEffect(() => {
    const sid = sessionId ?? tree?.session_id ?? null
    if (!sid || !dateColForPeriods) {
      setDerivedPeriods([])
      return
    }
    derivePeriods(sid, dateColForPeriods, granularityForPeriods)
      .then((res) => {
        setDerivedPeriods(res.periods)
        if (!config.comparison.current_period && !config.comparison.prior_period) {
          updateConfig({
            ...config,
            comparison: {
              ...config.comparison,
              current_period: res.suggested_current ?? undefined,
              prior_period: res.suggested_prior ?? undefined,
            },
          })
        }
      })
      .catch(() => setDerivedPeriods([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSid, dateColForPeriods, granularityForPeriods])

  const monthlyMeta = uploadMeta as MonthlyUploadMeta | null
  // Prefer column-derived periods; fall back to legacy filename-derived periods.
  const loadedPeriods = derivedPeriods.length ? derivedPeriods : monthlyMeta?.loaded_periods ?? []
  const numericCols = uploadMeta
    ? Object.entries(uploadMeta.suggestions)
        .filter(([, s]) => s === 'numeric')
        .map(([c]) => c)
    : []
  const catCols = uploadMeta
    ? Object.entries(uploadMeta.suggestions)
        .filter(([, s]) => s === 'categorical' || s === 'text')
        .map(([c]) => c)
    : []
  const hierarchyAddable = catCols.filter((c) => !config.data.hierarchy.includes(c))

  const posCond = config.rules.conditions.find(
    (c) => c.type === 'contribution' && c.direction === 'positive',
  )
  const negCond = config.rules.conditions.find(
    (c) => c.type === 'contribution' && c.direction === 'negative',
  )
  const topKCond = config.rules.conditions.find((c) => c.type === 'top_k')
  const posPct = posCond?.threshold != null ? Math.round(posCond.threshold * 100) : 75
  const negPct = negCond?.threshold != null ? Math.round(negCond.threshold * 100) : 20
  const topK = topKCond?.k ?? 3

  function setPosThreshold(pct: number) {
    const threshold = Math.max(0, Math.min(100, pct)) / 100
    const pos: RuleCondition = { type: 'contribution', threshold, direction: 'positive' }
    const others = config.rules.conditions.filter(
      (c) => !(c.type === 'contribution' && c.direction === 'positive'),
    )
    updateConfig({ ...config, rules: { ...config.rules, conditions: [pos, ...others] } })
  }

  function setNegThreshold(pct: number) {
    const threshold = Math.max(0, Math.min(100, pct)) / 100
    const neg: RuleCondition = { type: 'contribution', threshold, direction: 'negative' }
    const others = config.rules.conditions.filter(
      (c) => !(c.type === 'contribution' && c.direction === 'negative'),
    )
    updateConfig({ ...config, rules: { ...config.rules, conditions: [...others, neg] } })
  }

  function setTopK(k: number) {
    const topk: RuleCondition = { type: 'top_k', k: Math.max(1, k) }
    const others = config.rules.conditions.filter((c) => c.type !== 'top_k')
    updateConfig({ ...config, rules: { ...config.rules, conditions: [...others, topk] } })
  }

  function toggleTopK(enabled: boolean) {
    if (enabled) {
      setTopK(topK)
    } else {
      updateConfig({
        ...config,
        rules: { ...config.rules, conditions: config.rules.conditions.filter((c) => c.type !== 'top_k') },
      })
    }
  }

  function moveHierarchy(from: number, dir: -1 | 1) {
    const h = [...config.data.hierarchy]
    const to = from + dir
    if (to < 0 || to >= h.length) return
    ;[h[from], h[to]] = [h[to], h[from]]
    updateConfig({ ...config, data: { ...config.data, hierarchy: h } })
  }

  function removeHierarchy(col: string) {
    updateConfig({
      ...config,
      data: { ...config.data, hierarchy: config.data.hierarchy.filter((c) => c !== col) },
    })
  }

  function addHierarchy(col: string) {
    if (!col || config.data.hierarchy.includes(col)) return
    // A column can't be both a breakdown axis and a filter — drop any existing
    // filter on it as it moves into the hierarchy.
    const filters = config.data.filters
    let nextFilters = filters
    if (filters && col in filters) {
      const { [col]: _removed, ...rest } = filters
      nextFilters = Object.keys(rest).length ? rest : undefined
    }
    updateConfig({
      ...config,
      data: {
        ...config.data,
        hierarchy: [...config.data.hierarchy, col],
        filters: nextFilters,
      },
    })
  }

  async function handleRebuild() {
    const sid = sessionId ?? tree?.session_id
    if (!sid) return
    setIsRebuilding(true)
    setBuilding(true)
    setRebuildErr(null)
    try {
      const primaryMetric = config.data.metric_cols[0] ?? 'ipv_variance'
      // Preserve the date column designated at build time (a real column for the
      // column-driven flow, or the legacy injected `_period`).
      const dateCol = config.data.date_col ?? '_period'
      // max_depth caps how deep the tree expands; raise it to at least cover
      // every hierarchy level the user configured.
      const maxDepth = Math.max(config.rules.max_depth, config.data.hierarchy.length)
      const resolved: Config = {
        ...config,
        data: { ...config.data, date_col: dateCol },
        comparison: { ...config.comparison, mode: 'pop', granularity: config.comparison.granularity ?? 'month' },
        metric_of_interest: { type: 'delta', primary_metric: primaryMetric },
        rules: { ...config.rules, max_depth: maxDepth },
      }
      await postConfig(sid, resolved)
      const next = await buildTree(sid)
      setTree(next)
      updateConfig(resolved)
      markClean()
    } catch (e) {
      setRebuildErr(e instanceof Error ? e.message : 'Rebuild failed')
    } finally {
      setIsRebuilding(false)
      setBuilding(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-3 columns-2 gap-4">
        <Section title="Data">
          <Field label="Metric">
            <select
              value={config.data.metric_cols[0] ?? ''}
              onChange={(e) =>
                updateConfig({
                  ...config,
                  data: { ...config.data, metric_cols: e.target.value ? [e.target.value] : [] },
                })
              }
              className={`${inputCls} max-w-[160px]`}
            >
              {numericCols.length === 0 && (
                <option value={config.data.metric_cols[0] ?? ''}>
                  {config.data.metric_cols[0] ?? '—'}
                </option>
              )}
              {numericCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <p className="text-[11px] text-gray-500 mb-1">Hierarchy</p>
            <div className="space-y-1">
              {config.data.hierarchy.map((col, i) => (
                <div
                  key={col}
                  className="flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1"
                >
                  <span className="text-[11px] font-medium text-gray-700 flex-1 truncate">
                    {i + 1}. {col}
                  </span>
                  <button
                    onClick={() => moveHierarchy(i, -1)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveHierarchy(i, 1)}
                    disabled={i === config.data.hierarchy.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button onClick={() => removeHierarchy(col)} className="text-gray-400 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {config.data.hierarchy.length === 0 && (
                <p className="text-[11px] text-gray-400 italic">No levels added</p>
              )}
            </div>
            {hierarchyAddable.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  addHierarchy(e.target.value)
                  e.currentTarget.value = ''
                }}
                className={`${inputCls} mt-1.5`}
              >
                <option value="">+ Add level…</option>
                {hierarchyAddable.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <p className="text-[11px] text-gray-500 mb-1">Filters</p>
            <FilterEditor
              meta={uploadMeta}
              sessionId={sessionId ?? tree?.session_id ?? null}
              config={config}
              onChange={updateConfig}
            />
          </div>
        </Section>

        <Section title="Comparison">
          <Field label="Current">
            {loadedPeriods.length > 0 ? (
              <select
                value={config.comparison.current_period ?? ''}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    comparison: { ...config.comparison, current_period: e.target.value || undefined },
                  })
                }
                className={`${inputCls} max-w-[160px]`}
              >
                <option value="">—</option>
                {loadedPeriods.map((p) => (
                  <option key={p.period} value={p.period_yyyymm}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={config.comparison.current_period ?? ''}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    comparison: { ...config.comparison, current_period: e.target.value || undefined },
                  })
                }
                placeholder="2026-03"
                className={`${inputCls} max-w-[120px]`}
              />
            )}
          </Field>
          <Field label="Prior">
            {loadedPeriods.length > 0 ? (
              <select
                value={config.comparison.prior_period ?? ''}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    comparison: { ...config.comparison, prior_period: e.target.value || undefined },
                  })
                }
                className={`${inputCls} max-w-[160px]`}
              >
                <option value="">—</option>
                {loadedPeriods.map((p) => (
                  <option key={p.period} value={p.period_yyyymm}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={config.comparison.prior_period ?? ''}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    comparison: { ...config.comparison, prior_period: e.target.value || undefined },
                  })
                }
                placeholder="2026-02"
                className={`${inputCls} max-w-[120px]`}
              />
            )}
          </Field>
        </Section>

        <Section title="Tree rules">
          <Field label="Max depth">
            <input
              type="number"
              min={1}
              max={10}
              value={config.rules.max_depth}
              onChange={(e) =>
                updateConfig({
                  ...config,
                  rules: { ...config.rules, max_depth: Math.max(1, Number(e.target.value) || 1) },
                })
              }
              className={`${inputCls} w-16`}
            />
          </Field>
          <Field label="Min sample">
            <input
              type="number"
              min={1}
              value={config.rules.min_sample_size}
              onChange={(e) =>
                updateConfig({
                  ...config,
                  rules: { ...config.rules, min_sample_size: Math.max(1, Number(e.target.value) || 1) },
                })
              }
              className={`${inputCls} w-16`}
            />
          </Field>
          <Field label="Pos contribution">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={posPct}
                onChange={(e) => setPosThreshold(Number(e.target.value))}
                className={`${inputCls} w-14`}
              />
              <span className="text-[11px] text-gray-400">%</span>
            </div>
          </Field>
          <Field label="Offsetting">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={negPct}
                onChange={(e) => setNegThreshold(Number(e.target.value))}
                className={`${inputCls} w-14`}
              />
              <span className="text-[11px] text-gray-400">%</span>
            </div>
          </Field>
          <Field label="Top-K fallback">
            <div className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!topKCond}
                onChange={(e) => toggleTopK(e.target.checked)}
                className="accent-blue-600 h-3 w-3"
              />
              {topKCond && (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className={`${inputCls} w-12`}
                />
              )}
            </div>
          </Field>
        </Section>
      </div>

      <div className="border-t border-gray-100 px-3 py-3 space-y-2">
        {rebuildErr && (
          <div className="flex items-start gap-1 text-[10px] text-red-600 bg-red-50 rounded p-1.5">
            <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
            {rebuildErr}
          </div>
        )}
        <Button
          size="sm"
          className="w-full text-xs"
          disabled={isRebuilding || (!isDirty && !!tree) || config.data.hierarchy.length === 0}
          onClick={handleRebuild}
        >
          {isRebuilding ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              {tree ? 'Applying…' : 'Building…'}
            </>
          ) : !tree ? (
            'Build tree'
          ) : isDirty ? (
            'Apply changes'
          ) : (
            'No pending changes'
          )}
        </Button>
        {config.data.hierarchy.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center">Add at least one hierarchy level to build.</p>
        )}
      </div>
    </div>
  )
}

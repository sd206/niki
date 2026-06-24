'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type {
  Family,
  Budget,
  BudgetPeriod,
  Expense,
  ExpenseCategory,
  ExpenseSource,
  SavingsGoal,
  FinancialCoachingResponse,
  VaultItem,
} from '@niki/shared';
import { BUDGET_PERIODS, EXPENSE_CATEGORIES } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, EmptyState, PageHeader } from '@/components/ui';
import { FinanceIcon, CameraIcon, MicIcon } from '@/components/icons';

type Tab = 'budgets' | 'expenses' | 'goals' | 'coaching';

/**
 * Single static route (apps/web uses `output: 'export'`), same reason as
 * /calendar, /vault, /events. Phase 2.B.2/2.B.3 add receipt OCR (pick an
 * existing Vault item) and voice input (record + transcribe) as alternate
 * ways to pre-fill the expense form below — both always land in the same
 * reviewable form, never auto-submit (see ExpensesTab).
 */
export default function FinancePage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('budgets');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  async function loadAll(familyId: string) {
    const [b, e, g] = await Promise.all([
      api.budgets.list(familyId),
      api.expenses.list(familyId),
      api.savingsGoals.list(familyId),
    ]);
    setBudgets(b);
    setExpenses(e);
    setGoals(g);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await api.users.me();
        if (!profile.familyIds.length) {
          window.location.href = '/onboarding';
          return;
        }
        const familyId = profile.familyIds[0];
        const result = await api.families.get(familyId);
        setFamily(result.family);
        await loadAll(familyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load finance data');
      } finally {
        setLoadingData(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!family) return;
    await loadAll(family.id);
  }

  if (loading || loadingData) {
    return <div className="container">Loading…</div>;
  }
  if (!user) {
    return <div className="container">Sign in first.</div>;
  }
  if (!family) {
    return null;
  }

  return (
    <AppShell>
      <PageHeader module="finance" icon={<FinanceIcon size={22} />} title="Finance" subtitle={family.name} />
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['budgets', 'expenses', 'goals', 'coaching'] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(t)}
            style={{ padding: '6px 14px' }}
          >
            {t === 'budgets'
              ? 'Budgets'
              : t === 'expenses'
                ? 'Expenses'
                : t === 'goals'
                  ? 'Savings Goals'
                  : 'Coaching'}
          </button>
        ))}
      </div>

      {tab === 'budgets' && (
        <BudgetsTab familyId={family.id} budgets={budgets} expenses={expenses} onChange={refresh} setError={setError} />
      )}
      {tab === 'expenses' && (
        <ExpensesTab familyId={family.id} expenses={expenses} budgets={budgets} onChange={refresh} setError={setError} />
      )}
      {tab === 'goals' && (
        <SavingsGoalsTab familyId={family.id} goals={goals} onChange={refresh} setError={setError} />
      )}
      {tab === 'coaching' && <CoachingTab familyId={family.id} />}
    </AppShell>
  );
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

// ---------- Budgets ----------

function BudgetsTab({
  familyId,
  budgets,
  expenses,
  onChange,
  setError,
}: {
  familyId: string;
  budgets: Budget[];
  expenses: Expense[];
  onChange: () => void;
  setError: (e: string | null) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [eventId, setEventId] = useState('');
  const [allocRows, setAllocRows] = useState<{ category: ExpenseCategory; amount: string }[]>([
    { category: 'other', amount: '' },
  ]);
  const [busy, setBusy] = useState(false);

  function addRow() {
    setAllocRows((rows) => [...rows, { category: 'other', amount: '' }]);
  }
  function updateRow(i: number, patch: Partial<{ category: ExpenseCategory; amount: string }>) {
    setAllocRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setAllocRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const categoryAllocations: Partial<Record<ExpenseCategory, number>> = {};
      for (const row of allocRows) {
        const amt = parseFloat(row.amount);
        if (!isNaN(amt) && amt > 0) categoryAllocations[row.category] = amt;
      }
      await api.budgets.create(familyId, {
        name,
        period,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        eventId: eventId || undefined,
        categoryAllocations,
      });
      setName('');
      setPeriod('monthly');
      setStartDate('');
      setEndDate('');
      setEventId('');
      setAllocRows([{ category: 'other', amount: '' }]);
      setFormOpen(false);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create budget');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(budgetId: string) {
    setError(null);
    try {
      await api.budgets.remove(familyId, budgetId);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete budget');
    }
  }

  return (
    <div>
      {budgets.length === 0 && (
        <EmptyState module="finance" icon={<FinanceIcon size={32} />} title="No budgets yet" description="Create one below to start tracking spend by category." />
      )}
      {budgets.map((b) => {
        const spentByCategory = new Map<string, number>();
        for (const ex of expenses) {
          if (ex.budgetId !== b.id) continue;
          spentByCategory.set(ex.category, (spentByCategory.get(ex.category) ?? 0) + ex.amount);
        }
        const categories = Object.keys(b.categoryAllocations) as ExpenseCategory[];
        return (
          <Card key={b.id}>
            <strong>{b.name}</strong> <Badge module="finance">{b.period}</Badge>
            {b.startDate && (
              <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                {' '}
                {b.startDate}{b.endDate ? ` – ${b.endDate}` : ''}
              </span>
            )}
            <ul style={{ margin: '8px 0', paddingLeft: 16 }}>
              {categories.map((cat) => {
                const allocated = b.categoryAllocations[cat] ?? 0;
                const spent = spentByCategory.get(cat) ?? 0;
                const over = spent > allocated;
                return (
                  <li key={cat} style={{ fontSize: 13, color: over ? 'var(--color-danger)' : undefined }}>
                    {cat}: {money(spent)} / {money(allocated)}
                  </li>
                );
              })}
              {categories.length === 0 && <li style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No category allocations set.</li>}
            </ul>
            <button className="btn-danger" onClick={() => handleDelete(b.id)}>
              Delete
            </button>
          </Card>
        );
      })}

      {!formOpen && (
        <button className="btn-primary" onClick={() => setFormOpen(true)}>
          + New budget
        </button>
      )}
      {formOpen && (
        <Card style={{ maxWidth: 420 }}>
          <h3 style={{ marginTop: 0 }}>New budget</h3>
          <label>Name</label>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <label>Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {(period === 'custom' || period === 'event') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>
                Start
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label style={{ flex: 1 }}>
                End
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
          )}
          {period === 'event' && (
            <input
              placeholder="Event ID"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          )}

          <h4 style={{ marginTop: 4, marginBottom: 8 }}>Category allocations</h4>
          {allocRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <select
                value={row.category}
                onChange={(e) => updateRow(i, { category: e.target.value as ExpenseCategory })}
                style={{ marginBottom: 0 }}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Amount"
                value={row.amount}
                onChange={(e) => updateRow(i, { amount: e.target.value })}
                style={{ width: 100, marginBottom: 0 }}
              />
              <button className="btn-secondary" onClick={() => removeRow(i)}>×</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={addRow} style={{ marginTop: 4 }}>
            + Add category
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" disabled={busy || !name} onClick={handleCreate}>
              Save
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Expenses ----------

function ExpensesTab({
  familyId,
  expenses,
  budgets,
  onChange,
  setError,
}: {
  familyId: string;
  expenses: Expense[];
  budgets: Budget[];
  onChange: () => void;
  setError: (e: string | null) => void;
}) {
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [budgetId, setBudgetId] = useState('');
  const [busy, setBusy] = useState(false);

  // 2.B.2/2.B.3 — provenance of whatever's currently in the form above.
  // Reset to 'manual' whenever the form is cleared/submitted; set to
  // 'receipt'/'voice' only right after a successful extraction/transcription.
  const [source, setSource] = useState<ExpenseSource>('manual');
  const [receiptVaultItemId, setReceiptVaultItemId] = useState<string | undefined>(undefined);

  // 2.B.2 — receipt OCR over an existing Vault item (never a fresh upload).
  const [showReceiptPicker, setShowReceiptPicker] = useState(false);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [selectedVaultItemId, setSelectedVaultItemId] = useState('');
  const [extracting, setExtracting] = useState(false);

  // 2.B.3 — voice capture via MediaRecorder, transcribed + best-effort parsed.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const sorted = useMemo(() => [...expenses].sort((a, b) => b.date.localeCompare(a.date)), [expenses]);

  function resetForm() {
    setAmount('');
    setMerchant('');
    setDate('');
    setCategory('other');
    setBudgetId('');
    setSource('manual');
    setReceiptVaultItemId(undefined);
    setTranscript('');
  }

  async function handleCreate() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !merchant || !date) return;
    setBusy(true);
    setError(null);
    try {
      await api.expenses.create(familyId, {
        amount: amt,
        merchant,
        date,
        category,
        budgetId: budgetId || undefined,
        receiptVaultItemId,
        source,
      });
      resetForm();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log expense');
    } finally {
      setBusy(false);
    }
  }

  // ----- Receipt OCR -----

  async function openReceiptPicker() {
    setShowReceiptPicker(true);
    if (vaultItems.length === 0) {
      try {
        const items = await api.vault.list(familyId);
        setVaultItems(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load Vault items');
      }
    }
  }

  async function handleExtract() {
    if (!selectedVaultItemId) return;
    setExtracting(true);
    setError(null);
    try {
      const extraction = await api.expenses.extractReceipt(familyId, selectedVaultItemId);
      if (extraction.amount !== undefined) setAmount(String(extraction.amount));
      if (extraction.merchant !== undefined) setMerchant(extraction.merchant);
      if (extraction.date !== undefined) setDate(extraction.date);
      setReceiptVaultItemId(selectedVaultItemId);
      setSource('receipt');
      setShowReceiptPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to extract receipt — review/fill in the fields manually');
    } finally {
      setExtracting(false);
    }
  }

  // ----- Voice input -----

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function handleTranscribe(blob: Blob) {
    setTranscribing(true);
    setError(null);
    try {
      const base64 = await blobToBase64(blob);
      const draft = await api.expenses.transcribeVoice(familyId, base64);
      setTranscript(draft.transcript);
      if (draft.amount !== undefined) setAmount(String(draft.amount));
      if (draft.merchant !== undefined) setMerchant(draft.merchant);
      if (draft.category !== undefined) setCategory(draft.category);
      if (draft.date !== undefined) setDate(draft.date);
      setSource('voice');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transcribe voice input');
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        handleTranscribe(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError('Microphone access denied or unavailable');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function handleDelete(expenseId: string) {
    setError(null);
    try {
      await api.expenses.remove(familyId, expenseId);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete expense');
    }
  }

  return (
    <div>
      <Card style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Log an expense</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" className="btn-secondary" onClick={openReceiptPicker} disabled={extracting} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CameraIcon size={15} />
            {extracting ? 'Scanning…' : 'Scan a receipt'}
          </button>
          <button type="button" className="btn-secondary" onClick={recording ? stopRecording : startRecording} disabled={transcribing} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MicIcon size={15} />
            {transcribing ? 'Transcribing…' : recording ? 'Stop recording' : 'Speak an expense'}
          </button>
        </div>

        {showReceiptPicker && (
          <Card style={{ background: 'var(--color-bg)', marginBottom: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>
              Pick a receipt already added to Vault — its photo is scanned on demand, never stored separately.
            </p>
            {vaultItems.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No Vault items found.</p>}
            <select value={selectedVaultItemId} onChange={(e) => setSelectedVaultItemId(e.target.value)} style={{ marginBottom: 8 }}>
              <option value="">Choose a Vault item…</option>
              {vaultItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleExtract} disabled={!selectedVaultItemId || extracting}>
                Extract
              </button>
              <button className="btn-secondary" onClick={() => setShowReceiptPicker(false)}>
                Cancel
              </button>
            </div>
          </Card>
        )}

        {transcript && (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginBottom: 10 }}>
            Heard: &quot;{transcript}&quot;
          </p>
        )}

        {source !== 'manual' && (
          <p style={{ fontSize: 13, marginBottom: 6 }}>
            <Badge module="finance">Pre-filled from {source === 'receipt' ? 'receipt scan' : 'voice'} — review before saving</Badge>
          </p>
        )}

        <label>Amount</label>
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <label>Merchant</label>
        <input
          placeholder="Merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {budgets.length > 0 && (
          <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
            <option value="">No budget</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn-primary"
          disabled={busy || !amount || !merchant || !date}
          onClick={handleCreate}
        >
          Add expense
        </button>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState module="finance" icon={<FinanceIcon size={32} />} title="No expenses logged yet" description="Log one above, scan a receipt, or speak it in." />
      ) : (
        sorted.map((ex) => (
          <Card key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {ex.date} — {ex.merchant} <Badge module="finance">{ex.category}</Badge>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {money(ex.amount)}
              <button className="btn-danger" onClick={() => handleDelete(ex.id)}>
                Delete
              </button>
            </span>
          </Card>
        ))
      )}
    </div>
  );
}

// ---------- Savings Goals ----------

function SavingsGoalsTab({
  familyId,
  goals,
  onChange,
  setError,
}: {
  familyId: string;
  goals: SavingsGoal[];
  onChange: () => void;
  setError: (e: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [contributions, setContributions] = useState<Record<string, string>>({});

  async function handleCreate() {
    const target = parseFloat(targetAmount);
    if (!name || isNaN(target) || target <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.savingsGoals.create(familyId, {
        name,
        targetAmount: target,
        currentAmount: 0,
        targetDate: targetDate || undefined,
      });
      setName('');
      setTargetAmount('');
      setTargetDate('');
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create savings goal');
    } finally {
      setBusy(false);
    }
  }

  async function handleContribute(goal: SavingsGoal) {
    const amt = parseFloat(contributions[goal.id] ?? '');
    if (isNaN(amt) || amt === 0) return;
    setError(null);
    try {
      await api.savingsGoals.update(familyId, goal.id, {
        currentAmount: Math.max(0, goal.currentAmount + amt),
      });
      setContributions((c) => ({ ...c, [goal.id]: '' }));
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update savings goal');
    }
  }

  async function handleDelete(goalId: string) {
    setError(null);
    try {
      await api.savingsGoals.remove(familyId, goalId);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete savings goal');
    }
  }

  return (
    <div>
      {goals.length === 0 && (
        <EmptyState module="finance" icon={<FinanceIcon size={32} />} title="No savings goals yet" description="Set one below to start tracking progress." />
      )}
      {goals.map((g) => {
        const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
        return (
          <Card key={g.id} style={{ maxWidth: 420 }}>
            <strong>{g.name}</strong>
            {g.targetDate && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}> — by {g.targetDate}</span>}
            <div style={{ background: 'var(--color-bg)', borderRadius: 4, height: 8, marginTop: 8 }}>
              <div style={{ background: 'var(--color-finance-600)', borderRadius: 4, height: 8, width: `${pct}%` }} />
            </div>
            <p style={{ fontSize: 13, margin: '4px 0' }}>
              {money(g.currentAmount)} / {money(g.targetAmount)} ({pct}%)
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                placeholder="Contribute amount"
                value={contributions[g.id] ?? ''}
                onChange={(e) => setContributions((c) => ({ ...c, [g.id]: e.target.value }))}
                style={{ width: 140, marginBottom: 0 }}
              />
              <button className="btn-secondary" onClick={() => handleContribute(g)}>
                Add
              </button>
              <button className="btn-danger" onClick={() => handleDelete(g.id)}>
                Delete
              </button>
            </div>
          </Card>
        );
      })}

      <Card style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>New savings goal</h3>
        <label>Name</label>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <label>Target amount</label>
        <input
          type="number"
          placeholder="Target amount"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
        />
        <label>
          Target date (optional)
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
        <button
          className="btn-primary"
          disabled={busy || !name || !targetAmount}
          onClick={handleCreate}
        >
          Save
        </button>
      </Card>
    </div>
  );
}

// ---------- Coaching (Phase 4.C) ----------

/**
 * Read-only report: overspending alerts + savings recommendations computed
 * deterministically by the API from real Budget/Expense/SavingsGoal data
 * (apps/api/src/routes/financialCoaching.ts). Gemini (if configured) only
 * supplies the `summary` phrasing — no numbers here come from an LLM, and
 * nothing on this tab creates or modifies any Task/Budget/Expense.
 */
function CoachingTab({ familyId }: { familyId: string }) {
  const [report, setReport] = useState<FinancialCoachingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.finance.coaching(familyId);
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load coaching insights');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, maxWidth: 480 }}>
        Overspending alerts and savings pacing, computed from your actual budgets and goals. Numbers are calculated
        directly — AI is only used to phrase the summary below.
      </p>
      <button className="btn-primary" onClick={handleLoad} disabled={loading}>
        {loading ? 'Checking…' : report ? 'Refresh insights' : 'Get coaching insights'}
      </button>
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', marginTop: 16 }}>{error}</Card>
      )}

      {report && (
        <div style={{ marginTop: 16, maxWidth: 560 }}>
          <p style={{ fontStyle: 'italic' }}>{report.summary}</p>

          <h4>Overspending alerts</h4>
          {report.alerts.length === 0 && <p style={{ color: 'var(--color-text-tertiary)' }}>No budgets are currently over allocation.</p>}
          {report.alerts.map((a, i) => (
            <Card key={`${a.budgetId}-${a.category}-${i}`} style={{ background: 'var(--color-danger-bg)' }}>
              <strong style={{ color: 'var(--color-danger)' }}>
                {a.budgetName} — {a.category}
              </strong>
              <p style={{ margin: '4px 0', fontSize: 13 }}>{a.message}</p>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {money(a.spent)} spent / {money(a.allocated)} allocated
              </span>
            </Card>
          ))}

          <h4 style={{ marginTop: 16 }}>Savings recommendations</h4>
          {report.recommendations.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)' }}>No savings goals need a contribution plan right now.</p>
          )}
          {report.recommendations.map((r) => (
            <Card key={r.goalId}>
              <strong>{r.goalName}</strong>
              <p style={{ margin: '4px 0', fontSize: 13 }}>{r.message}</p>
              {r.suggestedMonthlyContribution !== undefined && (
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  Suggested: {money(r.suggestedMonthlyContribution)}/month
                </span>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { api } from '../lib/api.js';

const SEV_STYLES = {
  critical: { chip: 'bg-[#93000a] text-white',            border: 'border-[#BA1A1A]', header: 'bg-[#FFDAD6] text-[#BA1A1A]' },
  high:     { chip: 'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/30', border: 'border-[#BA1A1A]', header: 'bg-[#FFDAD6] text-[#BA1A1A]' },
  medium:   { chip: 'bg-amber-50 text-amber-700 border border-amber-200',    border: 'border-amber-300', header: 'bg-amber-50 text-amber-700' },
  low:      { chip: 'bg-slate-100 text-slate-600',        border: 'border-slate-300', header: 'bg-slate-50 text-slate-700' },
};

export default function OrderEntryModal({ patientId, onClose, onOrderPlaced, initial, onOrderSaved }) {
  if (initial) {
    return <EditOrderForm order={initial} onClose={onClose} onSave={onOrderSaved} />;
  }
  return <CreateOrderForm patientId={patientId} onClose={onClose} onOrderPlaced={onOrderPlaced} />;
}

function CreateOrderForm({ patientId, onClose, onOrderPlaced }) {
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [reason, setReason] = useState('');
  const [aiCheck, setAiCheck] = useState(null); // {severity, conflicts, alternatives}
  const [overrideReason, setOverrideReason] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const blocking = aiCheck && (aiCheck.severity === 'critical' || aiCheck.severity === 'high');

  async function runPreview() {
    if (!medication.trim()) return;
    setPreviewing(true);
    setErr(null);
    try {
      const r = await api.post(`/patients/${patientId}/orders/preview`, {
        medication: medication.trim(),
        dosage,
      });
      setAiCheck(r.aiCheck);
    } catch (e) {
      setErr(e.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (!medication.trim() || !dosage.trim()) {
      setErr('Medication and dosage are required.');
      return;
    }
    if (blocking && !overrideReason.trim()) {
      setErr('An override reason is required to proceed with a blocked order.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.post(`/patients/${patientId}/orders`, {
        medication: medication.trim(),
        dosage: dosage.trim(),
        reason: reason || null,
        override_reason: blocking ? overrideReason.trim() : null,
      });
      onOrderPlaced?.(r.order);
      onClose();
    } catch (e) {
      // 409 = must override; the backend also returned a fresh aiCheck.
      if (e.status === 409 && e.data?.aiCheck) {
        setAiCheck(e.data.aiCheck);
        setErr('The check flagged a conflict. Review below and provide an override reason if you still want to proceed.');
      } else {
        setErr(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function pickAlternative(altName) {
    setMedication(altName);
    setAiCheck(null);
    setOverrideReason('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">New Order</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs a safety check before the order is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Medication
              </label>
              <input
                type="text"
                value={medication}
                onChange={(e) => {
                  setMedication(e.target.value);
                  setAiCheck(null);
                  setOverrideReason('');
                }}
                onBlur={runPreview}
                placeholder="e.g. Amoxicillin"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Dosage & frequency
              </label>
              <input
                type="text"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="e.g. 500mg TID"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Clinical reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why is this order being placed?"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
          </div>

          <button
            type="button"
            onClick={runPreview}
            disabled={previewing || !medication.trim()}
            className="text-xs font-semibold text-[#2304CF] hover:underline disabled:opacity-50"
          >
            {previewing ? 'Checking…' : 'Re-run safety check'}
          </button>

          {/* AI Check result */}
          {aiCheck && (
            <AiCheckResult check={aiCheck} onPickAlternative={pickAlternative} />
          )}

          {/* Override reason - only when blocking */}
          {blocking && (
            <div className="rounded-lg border-2 border-[#BA1A1A]/40 bg-[#FFDAD6]/30 p-4">
              <label className="block text-xs font-bold text-[#BA1A1A] uppercase tracking-wide mb-1">
                Override reason (required)
              </label>
              <p className="text-xs text-slate-600 mb-2">
                To proceed despite the safety flag, document your reasoning. This is
                written to the audit log with your name and department.
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="e.g. Discussed with patient; benefit outweighs risk; monitored administration."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#BA1A1A] focus:ring-1 focus:ring-[#BA1A1A]"
              />
            </div>
          )}

          {err && (
            <div className="text-sm text-[#BA1A1A] bg-[#FFDAD6] border border-[#BA1A1A]/20 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </form>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className={`px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-colors disabled:opacity-60 ${
              blocking
                ? 'bg-[#BA1A1A] hover:bg-[#8f1414]'
                : 'bg-[#2304CF] hover:bg-[#1c03a6]'
            }`}
          >
            {submitting
              ? 'Placing order…'
              : blocking
                ? 'Override & place order'
                : 'Place order'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditOrderForm({ order, onClose, onSave }) {
  const [dosage, setDosage] = useState(order.dosage);
  const [reason, setReason] = useState(order.reason || '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e?.preventDefault?.();
    if (!dosage.trim()) {
      setErr('Dosage is required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await onSave({ dosage: dosage.trim(), reason: reason.trim() || null });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Edit Prescription</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Medication can't be changed here — place a new order instead.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Medication
            </label>
            <input
              type="text"
              value={order.medication}
              disabled
              className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Dosage & frequency
            </label>
            <input
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Clinical reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
          </div>

          {err && (
            <div className="text-sm text-[#BA1A1A] bg-[#FFDAD6] border border-[#BA1A1A]/20 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-colors disabled:opacity-60 bg-[#2304CF] hover:bg-[#1c03a6]"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AiCheckResult({ check, onPickAlternative }) {
  const style = SEV_STYLES[check.severity] || SEV_STYLES.low;
  if (check.severity === 'none') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
        <p className="text-sm text-emerald-800 font-medium">
          No conflicts found with recorded allergies or active medications.
        </p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border-2 ${style.border} overflow-hidden`}>
      <div className={`px-4 py-2 flex items-center justify-between ${style.header}`}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">warning</span>
          <span className="font-bold text-sm">Safety alert</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${style.chip}`}>
          {check.severity}
        </span>
      </div>
      <div className="p-4 space-y-3 bg-white">
        {check.conflicts.map((c, i) => (
          <div key={i} className="text-sm">
            <p className="text-slate-800">{c.message}</p>
            {c.source?.kind === 'allergy' && c.source.recorded_by && (
              <p className="text-xs text-slate-500 mt-1">
                Source: allergy recorded by{' '}
                <span className="font-semibold">{c.source.recorded_by}</span>
                {c.source.recorded_by_department ? ` (${c.source.recorded_by_department})` : ''}
                {c.source.recorded_at
                  ? ` on ${new Date(c.source.recorded_at).toLocaleDateString()}`
                  : ''}
                . Reaction: {c.source.reaction || 'unspecified'}.
              </p>
            )}
            {c.source?.kind === 'active_medication' && c.source.medication && (
              <p className="text-xs text-slate-500 mt-1">
                Source: active order —{' '}
                <span className="font-semibold">
                  {c.source.medication} {c.source.dosage || ''}
                </span>
                .
              </p>
            )}
          </div>
        ))}
        {check.alternatives?.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Suggested alternatives
            </p>
            <div className="space-y-1.5">
              {check.alternatives.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPickAlternative(a.medication)}
                  className="w-full text-left flex items-start justify-between gap-3 px-3 py-2 rounded-md bg-slate-50 hover:bg-[#E0E0FF]/60 transition-colors group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-[#2304CF]">
                      {a.medication}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.note}</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-[#2304CF] text-[18px]">
                    arrow_forward
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

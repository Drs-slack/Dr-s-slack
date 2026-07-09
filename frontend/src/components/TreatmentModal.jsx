import { useState } from 'react';
import { api } from '../lib/api.js';

const SEV_STYLES = {
  critical: { chip: 'bg-[#93000a] text-white',            border: 'border-[#BA1A1A]', header: 'bg-[#FFDAD6] text-[#BA1A1A]' },
  high:     { chip: 'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/30', border: 'border-[#BA1A1A]', header: 'bg-[#FFDAD6] text-[#BA1A1A]' },
  medium:   { chip: 'bg-amber-50 text-amber-700 border border-amber-200',    border: 'border-amber-300', header: 'bg-amber-50 text-amber-700' },
  low:      { chip: 'bg-slate-100 text-slate-600',        border: 'border-slate-300', header: 'bg-slate-50 text-slate-700' },
};

export default function TreatmentModal({ patientId, careTeam, onClose, onTreatmentAdded, initial, onTreatmentSaved }) {
  if (initial) {
    return <EditTreatmentForm treatment={initial} onClose={onClose} onSave={onTreatmentSaved} />;
  }
  return <CreateTreatmentForm patientId={patientId} careTeam={careTeam} onClose={onClose} onTreatmentAdded={onTreatmentAdded} />;
}

function CreateTreatmentForm({ patientId, careTeam, onClose, onTreatmentAdded }) {
  const departments = [...new Set(careTeam.map((d) => d.department_name))];
  const [department, setDepartment] = useState(departments[0] || '');
  const [treatmentName, setTreatmentName] = useState('');
  const [doctorId, setDoctorId] = useState(
    careTeam.find((d) => d.department_name === departments[0])?.id || ''
  );
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('ongoing');
  const [notes, setNotes] = useState('');
  const [aiCheck, setAiCheck] = useState(null); // {severity, conflicts}
  const [overrideReason, setOverrideReason] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const doctorsInDept = careTeam.filter((d) => d.department_name === department);
  const blocking = aiCheck && (aiCheck.severity === 'critical' || aiCheck.severity === 'high');

  function handleDepartmentChange(name) {
    setDepartment(name);
    const firstDoc = careTeam.find((d) => d.department_name === name);
    setDoctorId(firstDoc?.id || '');
  }

  async function runPreview() {
    if (!treatmentName.trim()) return;
    setPreviewing(true);
    setErr(null);
    try {
      const r = await api.post(`/patients/${patientId}/treatments/preview`, {
        treatment_name: treatmentName.trim(),
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
    if (!department || !treatmentName.trim() || !doctorId || !startDate) {
      setErr('Please fill in department, treatment name, doctor, and start date.');
      return;
    }
    if (blocking && !overrideReason.trim()) {
      setErr('An override reason is required to proceed with a flagged treatment.');
      return;
    }
    const dep = careTeam.find((d) => d.id === Number(doctorId));
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.post(`/patients/${patientId}/treatments`, {
        department_id: dep?.department_id,
        treatment_name: treatmentName.trim(),
        assigned_doctor_id: Number(doctorId),
        start_date: startDate,
        status,
        notes: notes.trim() || null,
        override_reason: blocking ? overrideReason.trim() : null,
      });
      onTreatmentAdded?.(r.treatment);
      onClose();
    } catch (e2) {
      // 409 = must override; the backend also returned a fresh aiCheck.
      if (e2.status === 409 && e2.data?.aiCheck) {
        setAiCheck(e2.data.aiCheck);
        setErr('This treatment may conflict with existing care. Review below and provide an override reason if you still want to proceed.');
      } else {
        setErr(e2.message);
      }
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
            <h2 className="text-xl font-bold text-slate-900">Add Treatment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Checks against other departments' active treatments before saving.
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
                Department
              </label>
              <select
                value={department}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Assigned doctor
              </label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              >
                {doctorsInDept.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Treatment name / type
            </label>
            <input
              type="text"
              value={treatmentName}
              onChange={(e) => {
                setTreatmentName(e.target.value);
                setAiCheck(null);
                setOverrideReason('');
              }}
              onBlur={runPreview}
              placeholder="e.g. NSAID therapy"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              >
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Notes / description
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Short notes about this treatment…"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
          </div>

          <button
            type="button"
            onClick={runPreview}
            disabled={previewing || !treatmentName.trim()}
            className="text-xs font-semibold text-[#2304CF] hover:underline disabled:opacity-50"
          >
            {previewing ? 'Checking…' : 'Re-run conflict check'}
          </button>

          {aiCheck && <ConflictCheckResult check={aiCheck} />}

          {blocking && (
            <div className="rounded-lg border-2 border-[#BA1A1A]/40 bg-[#FFDAD6]/30 p-4">
              <label className="block text-xs font-bold text-[#BA1A1A] uppercase tracking-wide mb-1">
                Override reason (required)
              </label>
              <p className="text-xs text-slate-600 mb-2">
                To proceed despite the high-risk flag, document your reasoning. This
                treatment will be tagged "High Risk / Conflict Override" and the
                conflicting doctor(s) will be notified.
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="e.g. Discussed with cardiology; short course only; renal function to be monitored."
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
              ? 'Adding…'
              : blocking
                ? 'Proceed anyway & add treatment'
                : 'Add treatment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTreatmentForm({ treatment, onClose, onSave }) {
  const [treatmentName, setTreatmentName] = useState(treatment.treatment_name);
  const [startDate, setStartDate] = useState((treatment.start_date || '').slice(0, 10));
  const [status, setStatus] = useState(treatment.status);
  const [notes, setNotes] = useState(treatment.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e?.preventDefault?.();
    if (!treatmentName.trim() || !startDate) {
      setErr('Treatment name and start date are required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await onSave({
        treatment_name: treatmentName.trim(),
        start_date: startDate,
        status,
        notes: notes.trim() || null,
      });
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
            <h2 className="text-xl font-bold text-slate-900">Edit Treatment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {treatment.department_name} · {treatment.assigned_doctor_name}
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
              Treatment name / type
            </label>
            <input
              type="text"
              value={treatmentName}
              onChange={(e) => setTreatmentName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              >
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Notes / description
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
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

function ConflictCheckResult({ check }) {
  const style = SEV_STYLES[check.severity] || SEV_STYLES.low;
  if (check.severity === 'none') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
        <p className="text-sm text-emerald-800 font-medium">
          No conflicts found with other departments' treatments, diagnoses, or allergies.
        </p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border-2 ${style.border} overflow-hidden`}>
      <div className={`px-4 py-2 flex items-center justify-between ${style.header}`}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">warning</span>
          <span className="font-bold text-sm">High risk warning</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${style.chip}`}>
          {check.severity}
        </span>
      </div>
      <div className="p-4 space-y-3 bg-white">
        {check.conflicts.map((c, i) => (
          <div key={i} className="text-sm">
            <p className="text-slate-800">{c.message}</p>
            {c.source?.kind === 'treatment' && (
              <p className="text-xs text-slate-500 mt-1">
                Source: existing treatment —{' '}
                <span className="font-semibold">{c.source.treatment_name}</span>, prescribed by{' '}
                <span className="font-semibold">{c.source.doctor_name}</span>
                {c.source.department_name ? ` (${c.source.department_name})` : ''}.
              </p>
            )}
            {c.source?.kind === 'diagnosis' && (
              <p className="text-xs text-slate-500 mt-1">
                Source: existing diagnosis —{' '}
                <span className="font-semibold">
                  {c.source.label}{c.source.code ? ` (${c.source.code})` : ''}
                </span>.
              </p>
            )}
            {c.source?.kind === 'allergy' && (
              <p className="text-xs text-slate-500 mt-1">
                Source: allergy recorded by{' '}
                <span className="font-semibold">{c.source.recorded_by || 'unknown clinician'}</span>
                {c.source.recorded_by_department ? ` (${c.source.recorded_by_department})` : ''}.
                Reaction: {c.source.reaction || 'unspecified'}.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

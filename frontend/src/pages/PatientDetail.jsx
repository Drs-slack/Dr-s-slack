import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import OrderEntryModal from '../components/OrderEntryModal.jsx';
import TreatmentModal from '../components/TreatmentModal.jsx';
import SlashAlertMenu from '../components/SlashAlertMenu.jsx';
import ContextMenu from '../components/ContextMenu.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useEmergencies } from '../lib/emergencies.jsx';
import { useToast } from '../components/Toast.jsx';
import { useContextMenu } from '../lib/useContextMenu.js';
import { useLongPress } from '../lib/useLongPress.js';
import { ALERT_TYPES, findAlertType } from '../lib/alertTypes.js';

const DEPT_STYLE = {
  Cardiology:    { bg: 'bg-red-50',    fg: 'text-red-500',    icon: 'favorite' },
  Nephrology:    { bg: 'bg-orange-50', fg: 'text-orange-500', icon: 'nephrology' },
  Dermatology:   { bg: 'bg-blue-50',   fg: 'text-blue-500',   icon: 'water_drop' },
  Radiology:     { bg: 'bg-rose-50',   fg: 'text-rose-400',   icon: 'radiology' },
  Neurology:     { bg: 'bg-pink-50',   fg: 'text-pink-400',   icon: 'psychology' },
};

const STATUS_STYLE = {
  'Pending Review': 'bg-amber-50 text-amber-700 border border-amber-200',
  'Concern':        'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/20',
  'Update':         'bg-blue-50 text-blue-700 border border-blue-200',
  'Note':           'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

const TREATMENT_STATUS_STYLE = {
  ongoing:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  completed: 'bg-slate-100 text-slate-600 border border-slate-200',
  paused:    'bg-amber-50 text-amber-700 border border-amber-200',
};

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday ? 'Today' : d.toLocaleDateString();
}

export default function PatientDetail() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { refresh: refreshEmergencies } = useEmergencies();
  const [searchParams] = useSearchParams();
  const highlightNoteId = searchParams.get('emergency') ? Number(searchParams.get('emergency')) : null;
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('discussion');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);
  const [conflictDetailTreatment, setConflictDetailTreatment] = useState(null);

  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [alertType, setAlertType] = useState(null);
  const [slashQuery, setSlashQuery] = useState(null); // null = menu closed, string = filter text after "/"
  const [slashIndex, setSlashIndex] = useState(0);
  const [alertFilter, setAlertFilter] = useState(null); // filter the timeline to one alert type
  const [aiMessages, setAiMessages] = useState([]); // shared with AICopilotPanel so the composer can pull analysis
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const { showToast } = useToast();
  const { menu, openMenu, closeMenu } = useContextMenu();
  const [editingTreatment, setEditingTreatment] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);

  useEffect(() => {
    load(alertFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, alertFilter]);

  async function load(filter) {
    setLoading(true);
    setErr(null);
    try {
      const qs = filter ? `?alert_type=${encodeURIComponent(filter)}` : '';
      const b = await api.get(`/patients/${patientId}${qs}`);
      setBundle(b);
    } catch (e) {
      setErr(e.status === 403
        ? "Your department isn't assigned to this patient."
        : e.message);
    } finally {
      setLoading(false);
    }
  }

  async function postNote() {
    const bodyText = newNoteBody.trim();
    if (!bodyText && !alertType && attachments.length === 0) return;
    const title = newNoteTitle.trim() || `${user.department_name} Note`;
    const attachmentSuffix = attachments.length
      ? `\n\n📎 Attached: ${attachments.map((f) => f.name).join(', ')}`
      : '';
    try {
      const r = await api.post(`/patients/${patientId}/notes`, {
        title,
        body: (bodyText || findAlertType(alertType)?.label || 'Attachment') + attachmentSuffix,
        kind: 'note',
        status: 'Note',
        alert_type: alertType,
      });
      setBundle((b) => ({ ...b, notes: [...b.notes, r.note] }));
      setNewNoteTitle('');
      setNewNoteBody('');
      setAlertType(null);
      setAttachments([]);
      if (r.note.alert_type === 'emergency') refreshEmergencies();
    } catch (e) {
      alert(e.message);
    }
  }

  async function resolveNote(noteId) {
    try {
      const r = await api.patch(`/patients/${patientId}/notes/${noteId}/resolve`);
      setBundle((b) => ({
        ...b,
        notes: b.notes.map((n) => (n.id === noteId ? { ...n, ...r.note } : n)),
      }));
      refreshEmergencies();
    } catch (e) {
      alert(e.message);
    }
  }

  // ---------- Right-click Edit/Delete: notes ----------

  async function saveNoteEdit(noteId, patch) {
    const prev = bundle.notes;
    setBundle((b) => ({ ...b, notes: b.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)) }));
    try {
      const r = await api.patch(`/patients/${patientId}/notes/${noteId}`, patch);
      setBundle((b) => ({ ...b, notes: b.notes.map((n) => (n.id === noteId ? { ...n, ...r.note } : n)) }));
      showToast('Entry updated.', 'success');
      return true;
    } catch (e) {
      setBundle((b) => ({ ...b, notes: prev }));
      showToast(e.message || 'Could not update entry.', 'error');
      return false;
    }
  }

  async function deleteNoteEntry(noteId) {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    const prev = bundle.notes;
    setBundle((b) => ({ ...b, notes: b.notes.filter((n) => n.id !== noteId) }));
    try {
      await api.delete(`/patients/${patientId}/notes/${noteId}`);
      showToast('Entry deleted.', 'success');
    } catch (e) {
      setBundle((b) => ({ ...b, notes: prev }));
      showToast(e.message || 'Could not delete entry.', 'error');
    }
  }

  // ---------- Right-click Edit/Delete: treatments ----------

  async function saveTreatmentEdit(treatmentId, patch) {
    const prev = bundle.treatments;
    setBundle((b) => ({ ...b, treatments: b.treatments.map((t) => (t.id === treatmentId ? { ...t, ...patch } : t)) }));
    try {
      const r = await api.patch(`/patients/${patientId}/treatments/${treatmentId}`, patch);
      setBundle((b) => ({ ...b, treatments: b.treatments.map((t) => (t.id === treatmentId ? { ...t, ...r.treatment } : t)) }));
      showToast('Treatment updated.', 'success');
      return true;
    } catch (e) {
      setBundle((b) => ({ ...b, treatments: prev }));
      showToast(e.message || 'Could not update treatment.', 'error');
      return false;
    }
  }

  async function deleteTreatmentEntry(treatmentId) {
    if (!window.confirm('Are you sure you want to delete this treatment?')) return;
    const prev = bundle.treatments;
    setBundle((b) => ({ ...b, treatments: b.treatments.filter((t) => t.id !== treatmentId) }));
    try {
      await api.delete(`/patients/${patientId}/treatments/${treatmentId}`);
      showToast('Treatment deleted.', 'success');
    } catch (e) {
      setBundle((b) => ({ ...b, treatments: prev }));
      showToast(e.message || 'Could not delete treatment.', 'error');
    }
  }

  // ---------- Right-click Edit/Delete: prescriptions (orders) ----------

  async function saveOrderEdit(orderId, patch) {
    const prev = bundle.medications;
    setBundle((b) => ({ ...b, medications: b.medications.map((m) => (m.id === orderId ? { ...m, ...patch } : m)) }));
    try {
      const r = await api.patch(`/patients/${patientId}/orders/${orderId}`, patch);
      setBundle((b) => ({ ...b, medications: b.medications.map((m) => (m.id === orderId ? { ...m, ...r.order } : m)) }));
      showToast('Prescription updated.', 'success');
      return true;
    } catch (e) {
      setBundle((b) => ({ ...b, medications: prev }));
      showToast(e.message || 'Could not update prescription.', 'error');
      return false;
    }
  }

  async function deleteOrderEntry(orderId) {
    if (!window.confirm('Are you sure you want to delete this prescription?')) return;
    const prev = bundle.medications;
    setBundle((b) => ({ ...b, medications: b.medications.filter((m) => m.id !== orderId) }));
    try {
      await api.delete(`/patients/${patientId}/orders/${orderId}`);
      showToast('Prescription deleted.', 'success');
    } catch (e) {
      setBundle((b) => ({ ...b, medications: prev }));
      showToast(e.message || 'Could not delete prescription.', 'error');
    }
  }

  // ---------- Right-click Edit/Delete: allergies (Risk Centre) ----------

  async function saveAllergyEdit(allergyId, patch) {
    const prev = bundle.allergies;
    setBundle((b) => ({ ...b, allergies: b.allergies.map((a) => (a.id === allergyId ? { ...a, ...patch } : a)) }));
    try {
      const r = await api.patch(`/patients/${patientId}/allergies/${allergyId}`, patch);
      setBundle((b) => ({ ...b, allergies: b.allergies.map((a) => (a.id === allergyId ? { ...a, ...r.allergy } : a)) }));
      showToast('Risk entry updated.', 'success');
      return true;
    } catch (e) {
      setBundle((b) => ({ ...b, allergies: prev }));
      showToast(e.message || 'Could not update risk entry.', 'error');
      return false;
    }
  }

  async function deleteAllergyEntry(allergyId) {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    const prev = bundle.allergies;
    setBundle((b) => ({ ...b, allergies: b.allergies.filter((a) => a.id !== allergyId) }));
    try {
      await api.delete(`/patients/${patientId}/allergies/${allergyId}`);
      showToast('Risk entry deleted.', 'success');
    } catch (e) {
      setBundle((b) => ({ ...b, allergies: prev }));
      showToast(e.message || 'Could not delete risk entry.', 'error');
    }
  }

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) setAttachments((a) => [...a, ...files]);
    e.target.value = '';
    setShowPlusMenu(false);
  }

  function removeAttachment(idx) {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  }

  function pullAIAnalysis() {
    const analysis = aiMessages.filter((m) => m.role === 'assistant');
    if (analysis.length === 0) {
      alert('No AI analysis yet — ask the AI Copilot a question first.');
      setShowPlusMenu(false);
      return;
    }
    const combined = analysis.map((m) => m.text).join('\n\n');
    setNewNoteTitle((t) => t || 'AI Analysis');
    setNewNoteBody((b) => (b ? `${b}\n\n${combined}` : combined));
    setShowPlusMenu(false);
  }

  const slashMatches = slashQuery === null
    ? []
    : ALERT_TYPES.filter((a) => a.id.startsWith(slashQuery.toLowerCase()));

  function handleBodyChange(e) {
    const val = e.target.value;
    setNewNoteBody(val);
    const m = /^\/(\w*)$/.exec(val);
    if (m) {
      setSlashQuery(m[1]);
      setSlashIndex(0);
    } else {
      setSlashQuery(null);
    }
  }

  function selectAlert(a) {
    setAlertType(a.id);
    setNewNoteBody('');
    setSlashQuery(null);
  }

  function handleBodyKeyDown(e) {
    if (slashQuery !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, Math.max(slashMatches.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (slashMatches[slashIndex]) selectAlert(slashMatches[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
    }
    if (e.key === 'Enter') postNote();
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center text-slate-400">
          Loading patient…
        </div>
      </Layout>
    );
  }
  if (err) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-slate-500">{err}</p>
          <button
            type="button"
            onClick={() => nav('/cases')}
            className="text-[#2304CF] font-semibold text-sm hover:underline"
          >
            Back to Active Cases
          </button>
        </div>
      </Layout>
    );
  }

  const { patient, allergies, medications, careTeam, notes, treatments } = bundle;

  function handleTreatmentAdded(treatment) {
    // Reload so the auto-generated conflict note (if any) shows up in the
    // Discussion Timeline alongside the new treatment.
    load(alertFilter);
    if (treatment.conflict_severity === 'critical') refreshEmergencies();
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="px-6 md:px-8 flex items-center gap-2 text-sm text-slate-500 shrink-0 -mt-2 mb-1">
        <Link to="/cases" className="hover:text-[#2304CF] transition-colors">Active Cases</Link>
        <span className="material-symbols-outlined text-[16px] text-slate-400">chevron_right</span>
        <span className="text-slate-900 font-semibold">{patient.full_name}</span>
      </div>

      {/* Three-pane */}
      <div className="flex-1 min-h-0 flex gap-6 px-6 md:px-8 py-4 overflow-hidden">
        {/* LEFT */}
        <aside className="w-[17.5rem] shrink-0 h-full overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-1">
          <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 p-5 flex flex-col items-start shrink-0">
            <img className="w-16 h-16 rounded-full object-cover border border-slate-200 mb-3" src={patient.avatar_url} alt="" />
            <h2 className="text-lg font-bold text-[#0F172A] leading-tight">{patient.full_name}</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              {patient.age} Years, {patient.gender}
            </p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">ID: {patient.external_id}</p>
            <div className="flex items-center gap-2 mt-3">
              <RiskChip level={patient.risk_level} />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                {patient.status}
              </span>
            </div>
          </div>

          <SidePanel title="Diagnoses" onViewAll={() => {}}>
            <div className="flex flex-wrap gap-2">
              {(patient.diagnoses || []).map((d) => (
                <span key={d.code} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {d.label} ({d.code})
                </span>
              ))}
              {(!patient.diagnoses || patient.diagnoses.length === 0) && (
                <p className="text-xs text-slate-400">None recorded.</p>
              )}
            </div>
          </SidePanel>

          <SidePanel title="Allergies">
            {allergies.length === 0 ? (
              <p className="text-xs text-slate-400">None recorded.</p>
            ) : (
              <ul className="space-y-2">
                {allergies.map((a) => (
                  <li key={a.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#BA1A1A]">warning</span>
                      <span className="font-semibold text-[#BA1A1A]">{a.substance}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#FFDAD6] text-[#BA1A1A] font-semibold capitalize">
                        {a.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 ml-6">
                      {a.reaction || 'no reaction noted'} · by {a.recorded_by_name}
                      {a.recorded_by_department ? ` (${a.recorded_by_department})` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel title="Vitals (Latest)" hint={patient.vitals?.measured_ago || ''}>
            {Object.entries(patient.vitals || {}).filter(([k]) => k !== 'measured_ago').map(([k, v]) => (
              <div key={k} className="flex justify-between items-center text-sm">
                <span className="text-slate-500 capitalize">{k.replace('_', ' ')}</span>
                <span className="font-semibold text-slate-900">{v}</span>
              </div>
            ))}
          </SidePanel>

          <SidePanel title="Lab Highlights">
            {(patient.labs || []).map((l) => (
              <div key={l.name} className="flex justify-between items-center text-sm">
                <span className="text-slate-500">{l.name}</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    l.flag === 'high' ? 'text-[#BA1A1A]' : l.flag === 'medium' ? 'text-amber-600' : 'text-slate-900'
                  }`}
                >
                  {l.value} {l.unit}
                  <span className="material-symbols-outlined text-[14px]">
                    {l.trend === 'up' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                </span>
              </div>
            ))}
          </SidePanel>

          <SidePanel title={`Medications (${medications.length})`}>
            {medications.slice(0, 6).map((m) => (
              <div key={m.id} className="flex justify-between items-center text-sm">
                <span className="text-slate-700 font-medium">{m.medication} {m.dosage.split(' ')[0]}</span>
                <span className="text-slate-400 text-xs">{m.dosage.split(' ').slice(1).join(' ')}</span>
              </div>
            ))}
          </SidePanel>
        </aside>

        {/* MAIN */}
        <section className="flex-1 h-full min-w-0 rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col overflow-hidden">
          {/* Case header */}
          <div className="px-6 pt-6 pb-4 shrink-0">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <h1 className="text-3xl font-bold text-[#0F172A] leading-tight">{patient.full_name}</h1>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(true)}
                  className="flex items-center gap-2 bg-[#2304CF] text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-[#1c03a6] transition-colors shadow-[0_4px_14px_rgba(35,4,207,0.25)]"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>New Order
                </button>
                <button
                  type="button"
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                  title="More actions"
                >
                  <span className="material-symbols-outlined text-[20px]">more_horiz</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-x-10 gap-y-3 mt-5">
              <Stat label="Age"          value={`${patient.age} Years`} />
              <Stat label="Gender"       value={patient.gender} />
              <Stat label="Blood Group"  value={patient.blood_group || '—'} />
              <Stat label="Patient ID"   value={patient.external_id} />
              <Stat label="Admitted On"  value={new Date(patient.admitted_on).toLocaleDateString()} />
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-6 mb-3">
              Care Team ({careTeam.length})
            </p>
            <div className="flex flex-wrap gap-6">
              {careTeam.map((d) => (
                <div key={d.id} className="flex items-center gap-2.5">
                  <img className="w-9 h-9 rounded-full object-cover" src={d.avatar_url} alt="" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 leading-tight">{d.full_name}</p>
                    <p className="text-xs text-slate-400 leading-tight flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {d.department_name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 px-6 pt-1 border-b border-t border-slate-100 shrink-0">
            {['discussion', 'treatments', 'orders', 'documents', 'labs', 'vitals'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-semibold transition-colors ${
                  tab === t ? 'tab-active font-bold' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {t === 'discussion' ? 'Discussion Timeline' :
                 t === 'treatments' ? 'Treatment Timeline' :
                 t === 'orders'     ? 'Prescription' :
                 t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            {tab === 'discussion' && (
              <div className="ml-auto mr-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-slate-400">filter_list</span>
                <select
                  value={alertFilter || ''}
                  onChange={(e) => setAlertFilter(e.target.value || null)}
                  className="pb-3 pt-3 text-sm font-semibold text-slate-500 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="">All alerts</option>
                  {ALERT_TYPES.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {tab === 'discussion' && (
              <DiscussionTimeline
                notes={notes}
                highlightNoteId={highlightNoteId}
                onResolve={resolveNote}
                user={user}
                menu={menu}
                openMenu={openMenu}
                onSaveNote={saveNoteEdit}
                onDeleteNote={deleteNoteEntry}
              />
            )}
            {tab === 'treatments' && (
              <TreatmentsTab
                treatments={treatments || []}
                onNew={() => setShowTreatmentModal(true)}
                onShowConflict={setConflictDetailTreatment}
                user={user}
                menu={menu}
                openMenu={openMenu}
                onEdit={setEditingTreatment}
                onDelete={deleteTreatmentEntry}
              />
            )}
            {tab === 'orders' && (
              <OrdersTab
                medications={medications}
                onNew={() => setShowOrderModal(true)}
                user={user}
                menu={menu}
                openMenu={openMenu}
                onEdit={setEditingOrder}
                onDelete={deleteOrderEntry}
              />
            )}
            {tab === 'documents' && (
              <DocumentsTab
                patient={patient}
                allergies={allergies}
                medications={medications}
                treatments={treatments || []}
              />
            )}
            {tab === 'labs' && <LabsTab labs={patient.labs || []} />}
            {tab === 'vitals' && <VitalsTab vitals={patient.vitals || {}} />}
          </div>

          {/* Composer (discussion tab only) */}
          {tab === 'discussion' && (
            <div className="p-4 border-t border-slate-100 shrink-0">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 ml-11">
                  {attachments.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 text-xs font-medium bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1.5 py-1">
                      <span className="material-symbols-outlined text-[14px] text-slate-500">description</span>
                      {f.name}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="material-symbols-outlined text-[14px] text-slate-400 hover:text-slate-600"
                        aria-label="Remove attachment"
                      >
                        close
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <img className="w-8 h-8 rounded-full object-cover shrink-0" src={user?.avatar_url} alt="You" />
                <div className="relative shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFilesSelected}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu((v) => !v)}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 transition-colors"
                    title="Add"
                  >
                    <span className="material-symbols-outlined text-[20px]">add</span>
                  </button>
                  {showPlusMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPlusMenu(false)} />
                      <div className="absolute bottom-full mb-2 left-0 w-56 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-100 py-1.5 z-20">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <span className="material-symbols-outlined text-[18px] text-slate-500">photo_library</span>
                          Add files &amp; photos
                        </button>
                        <button
                          type="button"
                          onClick={pullAIAnalysis}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[#2304CF]">auto_awesome</span>
                          Pull AI analysis
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-40 bg-slate-100 border border-slate-200 rounded-full px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
                />
                <div className="relative flex-1 flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full pl-2 pr-4 py-1.5 focus-within:border-[#2304CF] focus-within:ring-1 focus-within:ring-[#2304CF]">
                  {alertType && (() => {
                    const a = findAlertType(alertType);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full pl-2.5 pr-1.5 py-1 shrink-0 ${a.chip}`}>
                        <span className="material-symbols-outlined text-[14px]">{a.icon}</span>
                        {a.label}
                        <button
                          type="button"
                          onClick={() => setAlertType(null)}
                          className="material-symbols-outlined text-[14px] hover:opacity-70"
                          aria-label="Remove alert tag"
                        >
                          close
                        </button>
                      </span>
                    );
                  })()}
                  <input
                    type="text"
                    value={newNoteBody}
                    onChange={handleBodyChange}
                    onKeyDown={handleBodyKeyDown}
                    placeholder={alertType ? 'Add context…' : 'Add a comment, or type / for a quick alert…'}
                    className="flex-1 bg-transparent py-1 text-sm placeholder:text-slate-400 focus:outline-none"
                  />
                  {slashQuery !== null && (
                    <SlashAlertMenu
                      query={slashQuery}
                      activeIndex={slashIndex}
                      onSelect={selectAlert}
                      onClose={() => setSlashQuery(null)}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={postNote}
                  disabled={!newNoteBody.trim() && !alertType && attachments.length === 0}
                  className="bg-[#2304CF] text-white text-sm font-semibold rounded-full px-5 py-2.5 hover:bg-[#1c03a6] transition-colors shrink-0 disabled:opacity-60"
                >
                  Post
                </button>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT */}
        <AICopilotPanel
          patientId={patientId}
          allergies={allergies}
          treatments={treatments || []}
          messages={aiMessages}
          setMessages={setAiMessages}
          user={user}
          menu={menu}
          openMenu={openMenu}
          onSaveAllergy={saveAllergyEdit}
          onDeleteAllergy={deleteAllergyEntry}
        />
      </div>

      {showOrderModal && (
        <OrderEntryModal
          patientId={patientId}
          onClose={() => setShowOrderModal(false)}
          onOrderPlaced={() => load(alertFilter)}
        />
      )}

      {editingOrder && (
        <OrderEntryModal
          patientId={patientId}
          initial={editingOrder}
          onClose={() => setEditingOrder(null)}
          onOrderSaved={async (patch) => {
            const ok = await saveOrderEdit(editingOrder.id, patch);
            if (ok) setEditingOrder(null);
          }}
        />
      )}

      {showTreatmentModal && (
        <TreatmentModal
          patientId={patientId}
          careTeam={careTeam}
          onClose={() => setShowTreatmentModal(false)}
          onTreatmentAdded={handleTreatmentAdded}
        />
      )}

      {editingTreatment && (
        <TreatmentModal
          patientId={patientId}
          careTeam={careTeam}
          initial={editingTreatment}
          onClose={() => setEditingTreatment(null)}
          onTreatmentSaved={async (patch) => {
            const ok = await saveTreatmentEdit(editingTreatment.id, patch);
            if (ok) setEditingTreatment(null);
          }}
        />
      )}

      {conflictDetailTreatment && (
        <TreatmentConflictModal
          treatment={conflictDetailTreatment}
          onClose={() => setConflictDetailTreatment(null)}
        />
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </Layout>
  );
}

// ---------- Small components ----------

function RiskChip({ level }) {
  const s = {
    high:   'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/20',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    low:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  }[level] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s}`}>
      {level ? level[0].toUpperCase() + level.slice(1) + ' Risk' : 'Unknown'}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-sm font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function SidePanel({ title, hint, onViewAll, children }) {
  return (
    <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[#2304CF] text-xs font-semibold hover:underline"
          >
            View all
          </button>
        )}
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function DiscussionTimeline({ notes, highlightNoteId, onResolve, user, menu, openMenu, onSaveNote, onDeleteNote }) {
  const highlightRef = useRef(null);

  useEffect(() => {
    if (highlightNoteId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightNoteId, notes]);

  if (notes.length === 0) {
    return <p className="text-slate-400 text-sm py-8 text-center">No discussion yet.</p>;
  }
  return (
    <div>
      {notes.map((n, i) => (
        <NoteRow
          key={n.id}
          note={n}
          isLast={i === notes.length - 1}
          isHighlighted={n.id === highlightNoteId}
          highlightRef={n.id === highlightNoteId ? highlightRef : null}
          onResolve={onResolve}
          user={user}
          menu={menu}
          openMenu={openMenu}
          onSaveNote={onSaveNote}
          onDeleteNote={onDeleteNote}
        />
      ))}
    </div>
  );
}

function NoteRow({ note: n, isLast, isHighlighted, highlightRef, onResolve, user, menu, openMenu, onSaveNote, onDeleteNote }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(n.title);
  const [body, setBody] = useState(n.body);
  const [saving, setSaving] = useState(false);

  const s = DEPT_STYLE[n.department_name] || { bg: 'bg-slate-50', fg: 'text-slate-500', icon: 'clinical_notes' };
  const alert = n.alert_type ? findAlertType(n.alert_type) : null;
  const isResolved = !!n.resolved_at;
  const isOwner = user.role === 'admin' || n.author_id === user.id;
  const menuKey = `note-${n.id}`;
  const isSelected = menu?.id === menuKey;

  const menuItems = [
    {
      key: 'edit',
      label: 'Edit',
      icon: 'edit',
      disabled: !isOwner,
      disabledReason: !isOwner ? 'You can only edit your own entries.' : undefined,
      onClick: () => {
        setTitle(n.title);
        setBody(n.body);
        setEditing(true);
      },
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'delete',
      danger: true,
      disabled: !isOwner,
      disabledReason: !isOwner ? 'You can only delete your own entries.' : undefined,
      onClick: () => onDeleteNote(n.id),
    },
  ];
  const longPress = useLongPress((e) => openMenu(e, menuKey, menuItems));

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const ok = await onSaveNote(n.id, { title: title.trim(), body: body.trim() });
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <div
      ref={highlightRef}
      onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
      {...longPress}
      className={`flex gap-4 px-6 py-5 ${isLast ? '' : 'border-b border-dashed border-slate-200'} ${isResolved ? '' : alert?.row || ''} ${isHighlighted ? 'message-highlight' : ''} ${isSelected ? 'bg-[#E0E0FF]/40' : ''}`}
    >
      <div className="w-16 shrink-0 text-right">
        <p className="text-xs font-bold text-slate-700">{fmtTime(n.created_at)}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{fmtDay(n.created_at)}</p>
      </div>
      <div className={`w-10 h-10 rounded-full ${s.bg} ${s.fg} flex items-center justify-center shrink-0`}>
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          {s.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full font-bold text-slate-900 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#2304CF] hover:bg-[#1c03a6] transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-bold text-slate-900 text-sm leading-tight">{n.title}</p>
                <p className="text-slate-400 text-xs mt-0.5">{n.author_name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {alert && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${isResolved ? 'bg-slate-200 text-slate-500' : alert.badge}`}>
                    <span className="material-symbols-outlined text-[14px]">{alert.icon}</span>
                    {alert.label.toUpperCase()}
                  </span>
                )}
                {isResolved && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    RESOLVED
                  </span>
                )}
                {alert?.id === 'emergency' && !isResolved && onResolve && (
                  <button
                    type="button"
                    onClick={() => onResolve(n.id)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-[#BA1A1A] text-[#BA1A1A] hover:bg-[#FFDAD6] transition-colors"
                  >
                    Resolve
                  </button>
                )}
                {n.status && (
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${STATUS_STYLE[n.status] || 'bg-slate-100 text-slate-600'}`}>
                    {n.status}
                  </span>
                )}
              </div>
            </div>
            <p className={`text-sm mt-2 leading-relaxed whitespace-pre-line ${isResolved ? 'text-slate-400' : 'text-slate-600'}`}>{n.body}</p>
            {isResolved && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                Resolved by {n.resolved_by_name || 'a doctor'} · {fmtDay(n.resolved_at)} {fmtTime(n.resolved_at)}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">chat_bubble_outline</span>
                {n.reply_count}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">thumb_up_off_alt</span>
                {n.like_count}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CONFLICT_BADGE_STYLE = {
  critical: 'bg-[#93000a] text-white',
  high:     'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/30',
  medium:   'bg-amber-50 text-amber-700 border border-amber-200',
  low:      'bg-slate-100 text-slate-600 border border-slate-200',
};

function TreatmentsTab({ treatments, onNew, onShowConflict, user, menu, openMenu, onEdit, onDelete }) {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-900">Treatment Timeline ({treatments.length})</h3>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 bg-[#2304CF] text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-[#1c03a6] transition-colors shadow-[0_4px_14px_rgba(35,4,207,0.25)]"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>Add Treatment
        </button>
      </div>

      {treatments.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">No treatments recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {treatments.map((t) => (
            <TreatmentCard
              key={t.id}
              t={t}
              onShowConflict={onShowConflict}
              user={user}
              menu={menu}
              openMenu={openMenu}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreatmentCard({ t, onShowConflict, user, menu, openMenu, onEdit, onDelete }) {
  const s = DEPT_STYLE[t.department_name] || { bg: 'bg-slate-50', fg: 'text-slate-500', icon: 'clinical_notes' };
  const isOwner = user.role === 'admin' || t.created_by === user.id || t.assigned_doctor_id === user.id;
  const isLocked = t.status === 'completed';
  const menuKey = `treatment-${t.id}`;
  const isSelected = menu?.id === menuKey;

  const menuItems = [
    {
      key: 'edit',
      label: 'Edit',
      icon: 'edit',
      disabled: !isOwner || isLocked,
      disabledReason: !isOwner
        ? 'You can only edit treatments you created or are assigned to.'
        : isLocked
          ? 'Completed treatments are locked.'
          : undefined,
      onClick: () => onEdit(t),
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'delete',
      danger: true,
      disabled: !isOwner || isLocked,
      disabledReason: !isOwner
        ? 'You can only delete treatments you created or are assigned to.'
        : isLocked
          ? 'Completed treatments are locked.'
          : undefined,
      onClick: () => onDelete(t.id),
    },
  ];
  const longPress = useLongPress((e) => openMenu(e, menuKey, menuItems));

  return (
    <div
      onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
      {...longPress}
      className={`rounded-[16px] border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 ${isSelected ? 'ring-2 ring-[#2304CF]/40 bg-[#E0E0FF]/20' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${s.bg} ${s.fg} flex items-center justify-center shrink-0`}>
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {s.icon}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{t.treatment_name}</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {t.department_name} · {t.assigned_doctor_name}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.conflict_severity && (
                <button
                  type="button"
                  onClick={() => onShowConflict?.(t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${CONFLICT_BADGE_STYLE[t.conflict_severity] || CONFLICT_BADGE_STYLE.low}`}
                  title="View conflict details"
                >
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                  {t.conflict_severity === 'critical' || t.conflict_severity === 'high' ? 'High Risk' : 'Conflict'}
                </button>
              )}
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${TREATMENT_STATUS_STYLE[t.status] || 'bg-slate-100 text-slate-600'}`}>
                {t.status}
              </span>
            </div>
          </div>
          {t.notes && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{t.notes}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
            <span>Started {new Date(t.start_date).toLocaleDateString()}</span>
            <span>Updated {new Date(t.updated_at).toLocaleDateString()} {fmtTime(t.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreatmentConflictModal({ treatment, onClose }) {
  const conflicts = treatment.conflict_details || [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Treatment Conflict Details</h2>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{treatment.conflict_severity} severity</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <div className="rounded-lg border border-[#BA1A1A]/30 bg-[#FFDAD6]/40 p-4">
            <p className="text-xs font-bold text-[#BA1A1A] uppercase tracking-wide mb-1">New treatment</p>
            <p className="font-semibold text-slate-900">{treatment.treatment_name}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {treatment.department_name} · {treatment.assigned_doctor_name}
            </p>
          </div>

          {conflicts.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm text-slate-800">{c.message}</p>
              {c.source?.kind === 'treatment' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#FFDAD6]/40 border border-[#BA1A1A]/20 p-3">
                    <p className="text-xs font-bold text-[#BA1A1A] uppercase tracking-wide mb-1">This treatment</p>
                    <p className="text-sm font-semibold text-slate-900">{treatment.treatment_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {treatment.department_name} · {treatment.assigned_doctor_name}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Conflicting treatment</p>
                    <p className="text-sm font-semibold text-slate-900">{c.source.treatment_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.source.department_name} · {c.source.doctor_name}
                    </p>
                  </div>
                </div>
              )}
              {c.source?.kind === 'diagnosis' && (
                <p className="text-xs text-slate-500 mt-2">
                  Conflicts with diagnosis:{' '}
                  <span className="font-semibold">
                    {c.source.label}{c.source.code ? ` (${c.source.code})` : ''}
                  </span>
                </p>
              )}
              {c.source?.kind === 'allergy' && (
                <p className="text-xs text-slate-500 mt-2">
                  Conflicts with recorded allergy:{' '}
                  <span className="font-semibold">{c.source.substance}</span>
                  {c.source.recorded_by ? ` — recorded by ${c.source.recorded_by}` : ''}
                  {c.source.recorded_by_department ? ` (${c.source.recorded_by_department})` : ''}
                </p>
              )}
            </div>
          ))}

          {treatment.is_override && (
            <div className="rounded-lg border-2 border-[#BA1A1A]/40 bg-[#FFDAD6]/30 p-4">
              <p className="text-xs font-bold text-[#BA1A1A] uppercase tracking-wide mb-1">Override reason</p>
              <p className="text-sm text-slate-700">{treatment.override_reason}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ medications, onNew, user, menu, openMenu, onEdit, onDelete }) {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-900">Active orders ({medications.length})</h3>
        <button
          type="button"
          onClick={onNew}
          className="text-sm font-semibold text-[#2304CF] hover:underline"
        >
          + New order
        </button>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
            <th className="pb-2 font-semibold">Medication</th>
            <th className="pb-2 font-semibold">Prescribed by</th>
            <th className="pb-2 font-semibold">Department</th>
            <th className="pb-2 font-semibold text-right">Since</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {medications.map((m) => (
            <OrderRow
              key={m.id}
              m={m}
              user={user}
              menu={menu}
              openMenu={openMenu}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderRow({ m, user, menu, openMenu, onEdit, onDelete }) {
  const isOwner = user.role === 'admin' || m.prescribed_by === user.id;
  const isLocked = m.status && m.status !== 'active';
  const menuKey = `order-${m.id}`;
  const isSelected = menu?.id === menuKey;

  const menuItems = [
    {
      key: 'edit',
      label: 'Edit',
      icon: 'edit',
      disabled: !isOwner || isLocked,
      disabledReason: !isOwner
        ? 'You can only edit prescriptions you placed.'
        : isLocked
          ? 'This prescription has already been cancelled.'
          : undefined,
      onClick: () => onEdit(m),
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'delete',
      danger: true,
      disabled: !isOwner || isLocked,
      disabledReason: !isOwner
        ? 'You can only delete prescriptions you placed.'
        : isLocked
          ? 'This prescription has already been cancelled.'
          : undefined,
      onClick: () => onDelete(m.id),
    },
  ];
  const longPress = useLongPress((e) => openMenu(e, menuKey, menuItems));

  return (
    <tr
      onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
      {...longPress}
      className={isSelected ? 'bg-[#E0E0FF]/30' : ''}
    >
      <td className="py-3 font-semibold text-slate-800">{m.medication}<span className="text-slate-400 font-normal ml-2">{m.dosage}</span></td>
      <td className="py-3 text-sm text-slate-600">{m.prescribed_by_name}</td>
      <td className="py-3 text-sm text-slate-600">{m.department_name}</td>
      <td className="py-3 text-right text-sm text-slate-500">
        {new Date(m.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

function EmptyTab({ label }) {
  return (
    <div className="p-12 text-center text-slate-400 text-sm">
      {label} — coming soon in this MVP.
    </div>
  );
}

const ALLERGY_SEVERITY_STYLE = {
  critical: 'bg-[#93000a] text-white',
  high:     'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/30',
  medium:   'bg-amber-50 text-amber-700 border border-amber-200',
  low:      'bg-slate-100 text-slate-600 border border-slate-200',
};

function DocSection({ title, children }) {
  return (
    <div className="rounded-[16px] border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{title}</h4>
      {children}
    </div>
  );
}

function DocumentsTab({ patient, allergies, medications, treatments }) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Patient Summary Document</h3>
          <p className="text-xs text-slate-400 mt-0.5">Auto-generated from this patient's record — for clinical reference.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm font-semibold text-[#2304CF] hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>Print
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DocSection title="Patient Information">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-400">Name</dt>
            <dd className="text-slate-800 font-semibold">{patient.full_name}</dd>
            <dt className="text-slate-400">Age / Gender</dt>
            <dd className="text-slate-800 font-semibold">{patient.age} Years, {patient.gender}</dd>
            <dt className="text-slate-400">Blood Group</dt>
            <dd className="text-slate-800 font-semibold">{patient.blood_group || '—'}</dd>
            <dt className="text-slate-400">Patient ID</dt>
            <dd className="text-slate-800 font-semibold">{patient.external_id}</dd>
            <dt className="text-slate-400">Admitted On</dt>
            <dd className="text-slate-800 font-semibold">{new Date(patient.admitted_on).toLocaleDateString()}</dd>
            <dt className="text-slate-400">Risk Level</dt>
            <dd className="text-slate-800 font-semibold capitalize">{patient.risk_level || '—'}</dd>
          </dl>
        </DocSection>

        <DocSection title={`Allergic Drugs & Substances (${allergies.length})`}>
          {allergies.length === 0 ? (
            <p className="text-sm text-slate-400">No known allergies recorded.</p>
          ) : (
            <ul className="space-y-3">
              {allergies.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 border-b border-dashed border-slate-100 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[#BA1A1A] mt-0.5">warning</span>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{a.substance}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Reaction: {a.reaction || 'unspecified'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Recorded by {a.recorded_by_name}
                        {a.recorded_by_department ? ` (${a.recorded_by_department})` : ''}
                        {a.recorded_at ? ` on ${new Date(a.recorded_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${ALLERGY_SEVERITY_STYLE[a.severity] || ALLERGY_SEVERITY_STYLE.low}`}>
                    {a.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DocSection>

        <DocSection title="Diagnoses">
          {(patient.diagnoses || []).length === 0 ? (
            <p className="text-sm text-slate-400">None recorded.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {patient.diagnoses.map((d) => (
                <span key={d.code} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {d.label} ({d.code})
                </span>
              ))}
            </div>
          )}
        </DocSection>

        <DocSection title={`Current Medications (${medications.length})`}>
          {medications.length === 0 ? (
            <p className="text-sm text-slate-400">No active medications.</p>
          ) : (
            <ul className="space-y-2">
              {medications.map((m) => (
                <li key={m.id} className="flex justify-between items-center text-sm">
                  <span className="text-slate-800 font-medium">{m.medication} <span className="text-slate-400 font-normal">{m.dosage}</span></span>
                  <span className="text-slate-400 text-xs">{m.prescribed_by_name}{m.department_name ? ` · ${m.department_name}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </DocSection>

        <DocSection title="Latest Vitals">
          {Object.entries(patient.vitals || {}).filter(([k]) => k !== 'measured_ago').length === 0 ? (
            <p className="text-sm text-slate-400">No vitals recorded.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              {Object.entries(patient.vitals || {}).filter(([k]) => k !== 'measured_ago').map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-400 capitalize">{k.replace('_', ' ')}</dt>
                  <dd className="text-slate-800 font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </DocSection>

        <DocSection title="Lab Highlights">
          {(patient.labs || []).length === 0 ? (
            <p className="text-sm text-slate-400">No labs recorded.</p>
          ) : (
            <ul className="space-y-2">
              {patient.labs.map((l) => (
                <li key={l.name} className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{l.name}</span>
                  <span className={`font-semibold ${l.flag === 'high' ? 'text-[#BA1A1A]' : l.flag === 'medium' ? 'text-amber-600' : 'text-slate-900'}`}>
                    {l.value} {l.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DocSection>

        {treatments.length > 0 && (
          <DocSection title={`Treatment Timeline (${treatments.length})`}>
            <ul className="space-y-2">
              {treatments.map((t) => (
                <li key={t.id} className="flex justify-between items-center text-sm">
                  <span className="text-slate-800 font-medium">{t.treatment_name}</span>
                  <span className="text-slate-400 text-xs capitalize">{t.status} · {t.department_name}</span>
                </li>
              ))}
            </ul>
          </DocSection>
        )}
      </div>
    </div>
  );
}

function LabsTab({ labs }) {
  return (
    <div className="p-6">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
            <th className="pb-2 font-semibold">Test</th>
            <th className="pb-2 font-semibold">Value</th>
            <th className="pb-2 font-semibold">Trend</th>
            <th className="pb-2 font-semibold text-right">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {labs.map((l) => (
            <tr key={l.name}>
              <td className="py-3 font-medium text-slate-800">{l.name}</td>
              <td className="py-3 text-sm text-slate-700">{l.value} {l.unit}</td>
              <td className="py-3 text-sm text-slate-500 capitalize">{l.trend}</td>
              <td className="py-3 text-right">
                <span className={`text-xs font-semibold capitalize ${
                  l.flag === 'high' ? 'text-[#BA1A1A]' : l.flag === 'medium' ? 'text-amber-600' : 'text-slate-500'
                }`}>{l.flag}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VitalsTab({ vitals }) {
  return (
    <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
      {Object.entries(vitals).filter(([k]) => k !== 'measured_ago').map(([k, v]) => (
        <div key={k} className="rounded-lg border border-slate-100 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold tracking-wide">{k.replace('_', ' ')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{v}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- AI Copilot panel ----------

function AICopilotPanel({ patientId, allergies, treatments, messages, setMessages, user, menu, openMenu, onSaveAllergy, onDeleteAllergy }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const suggestions = [
    'What are the current risks for this patient?',
    'Summarize what nephrology has said so far.',
    'What allergies does this patient have?',
    'What does the team recommend?',
  ];

  async function send(question) {
    const text = (question || q).trim();
    if (!text && attachments.length === 0) return;
    const attachmentSuffix = attachments.length
      ? `\n📎 Attached: ${attachments.map((f) => f.name).join(', ')}`
      : '';
    setMessages((m) => [...m, { role: 'user', text: text + attachmentSuffix }]);
    setQ('');
    setAttachments([]);
    setBusy(true);
    try {
      const r = await api.post(`/ai/patients/${patientId}/ask`, { question: text || 'Analyze the attached file(s).' });
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, degraded: r.degraded }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) setAttachments((a) => [...a, ...files]);
    e.target.value = '';
    setShowPlusMenu(false);
  }

  function removeAttachment(idx) {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  }

  function pullDiscussionNotes() {
    setQ((v) => (v ? v : 'Summarize the discussion timeline so far.'));
    setShowPlusMenu(false);
  }

  return (
    <aside className="w-[21.25rem] shrink-0 h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex-1 min-h-0 rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E0E0FF] text-[#2304CF] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">AI Copilot</p>
              <p className="text-[11px] text-slate-400 leading-tight">Grounded in this record</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-xs font-medium text-[#2304CF] bg-[#E0E0FF]/60 hover:bg-[#E0E0FF] rounded-full px-3 py-1.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="bg-[#2304CF] text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className={`text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[90%] leading-relaxed whitespace-pre-line ${
                  m.degraded ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'
                }`}>
                  {m.text}
                </div>
              </div>
            )
          )}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-500 text-sm rounded-2xl px-4 py-2.5 animate-pulse">
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 shrink-0">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 text-xs font-medium bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1.5 py-1">
                  <span className="material-symbols-outlined text-[14px] text-slate-500">description</span>
                  {f.name}
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="material-symbols-outlined text-[14px] text-slate-400 hover:text-slate-600"
                    aria-label="Remove attachment"
                  >
                    close
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-1.5 pr-1.5 py-1.5">
            <div className="relative shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                onClick={() => setShowPlusMenu((v) => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Add"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
              {showPlusMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPlusMenu(false)} />
                  <div className="absolute bottom-full mb-2 left-0 w-56 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-100 py-1.5 z-20">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <span className="material-symbols-outlined text-[18px] text-slate-500">photo_library</span>
                      Add files &amp; photos
                    </button>
                    <button
                      type="button"
                      onClick={pullDiscussionNotes}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#2304CF]">forum</span>
                      Pull discussion timeline
                    </button>
                  </div>
                </>
              )}
            </div>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Ask anything about this patient..."
              className="flex-1 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy || (!q.trim() && attachments.length === 0)}
              className="w-8 h-8 rounded-full bg-[#2304CF] text-white flex items-center justify-center shrink-0 hover:bg-[#1c03a6] transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            AI responses can make mistakes. Verify important info.
          </p>
        </div>
      </div>

      {/* Risk Center — computed from actual allergies + patient state */}
      <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 p-5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">Risk Center</h3>
        </div>
        <div className="space-y-3">
          {allergies.map((a) => (
            <AllergyRiskRow
              key={a.id}
              a={a}
              user={user}
              menu={menu}
              openMenu={openMenu}
              onSave={onSaveAllergy}
              onDelete={onDeleteAllergy}
            />
          ))}
          {(treatments || []).filter((t) => t.conflict_severity).map((t) => (
            <ConflictRiskRow key={`conflict-${t.id}`} t={t} menu={menu} openMenu={openMenu} />
          ))}
          {allergies.length === 0 && (treatments || []).every((t) => !t.conflict_severity) && (
            <p className="text-xs text-slate-400">No critical risks tracked yet.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

function AllergyRiskRow({ a, user, menu, openMenu, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [substance, setSubstance] = useState(a.substance);
  const [reaction, setReaction] = useState(a.reaction || '');
  const [severity, setSeverity] = useState(a.severity);
  const [saving, setSaving] = useState(false);

  const isOwner = user.role === 'admin' || a.recorded_by === user.id;
  const menuKey = `allergy-${a.id}`;
  const isSelected = menu?.id === menuKey;

  const menuItems = [
    {
      key: 'edit',
      label: 'Edit',
      icon: 'edit',
      disabled: !isOwner,
      disabledReason: !isOwner ? 'You can only edit risk entries you recorded.' : undefined,
      onClick: () => {
        setSubstance(a.substance);
        setReaction(a.reaction || '');
        setSeverity(a.severity);
        setEditing(true);
      },
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'delete',
      danger: true,
      disabled: !isOwner,
      disabledReason: !isOwner ? 'You can only delete risk entries you recorded.' : undefined,
      onClick: () => onDelete(a.id),
    },
  ];
  const longPress = useLongPress((e) => openMenu(e, menuKey, menuItems));

  async function save() {
    if (!substance.trim()) return;
    setSaving(true);
    const ok = await onSave(a.id, { substance: substance.trim(), reaction: reaction.trim() || null, severity });
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-slate-200 p-2.5 space-y-1.5">
        <input
          type="text"
          value={substance}
          onChange={(e) => setSubstance(e.target.value)}
          placeholder="Substance"
          className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
        />
        <input
          type="text"
          value={reaction}
          onChange={(e) => setReaction(e.target.value)}
          placeholder="Reaction"
          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 capitalize focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-[#2304CF] hover:bg-[#1c03a6] transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
      {...longPress}
      className={`flex items-start justify-between gap-2 rounded-lg px-1.5 py-1 -mx-1.5 ${isSelected ? 'bg-[#E0E0FF]/40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="w-2 h-2 rounded-full bg-[#BA1A1A] mt-1.5 shrink-0"></span>
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">
            {a.substance} allergy
          </p>
          <p className="text-xs text-slate-500 leading-tight">
            {a.recorded_by_name}{a.recorded_by_department ? ` · ${a.recorded_by_department}` : ''}
          </p>
        </div>
      </div>
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/20 shrink-0 capitalize">
        {a.severity}
      </span>
    </div>
  );
}

function ConflictRiskRow({ t, menu, openMenu }) {
  const menuKey = `conflict-${t.id}`;
  const isSelected = menu?.id === menuKey;
  const reason = "Conflict entries are derived from the Treatment Timeline — edit or resolve the treatment there.";
  const menuItems = [
    { key: 'edit', label: 'Edit', icon: 'edit', disabled: true, disabledReason: reason, onClick: () => {} },
    { key: 'delete', label: 'Delete', icon: 'delete', danger: true, disabled: true, disabledReason: reason, onClick: () => {} },
  ];
  const longPress = useLongPress((e) => openMenu(e, menuKey, menuItems));

  return (
    <div
      onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
      {...longPress}
      title={reason}
      className={`flex items-start justify-between gap-2 rounded-lg px-1.5 py-1 -mx-1.5 ${isSelected ? 'bg-[#E0E0FF]/40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="w-2 h-2 rounded-full bg-[#BA1A1A] mt-1.5 shrink-0"></span>
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">
            ⚠ {t.treatment_name} conflict
          </p>
          <p className="text-xs text-slate-500 leading-tight">
            {t.assigned_doctor_name}{t.department_name ? ` · ${t.department_name}` : ''}
          </p>
        </div>
      </div>
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/20 shrink-0 capitalize">
        {t.conflict_severity}
      </span>
    </div>
  );
}

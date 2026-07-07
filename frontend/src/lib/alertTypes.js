// Quick-alert tags available via the "/" slash command in the discussion composer.
// Keep `id` values in sync with the ALERT_TYPES set in backend/src/routes/notes.js.
export const ALERT_TYPES = [
  {
    id: 'emergency',
    command: '/emergency',
    label: 'Emergency',
    icon: 'emergency',
    dot: 'bg-[#BA1A1A]',
    chip: 'bg-[#FFDAD6] text-[#BA1A1A]',
    badge: 'bg-[#BA1A1A] text-white',
    row: 'bg-[#FFF5F4]',
  },
  {
    id: 'critical',
    command: '/critical',
    label: 'Critical',
    icon: 'priority_high',
    dot: 'bg-orange-600',
    chip: 'bg-orange-100 text-orange-800',
    badge: 'bg-orange-600 text-white',
    row: 'bg-orange-50/60',
  },
  {
    id: 'urgent',
    command: '/urgent',
    label: 'Urgent',
    icon: 'bolt',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-800',
    badge: 'bg-amber-500 text-white',
    row: '',
  },
  {
    id: 'stable',
    command: '/stable',
    label: 'Stable',
    icon: 'check_circle',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-800',
    badge: 'bg-emerald-600 text-white',
    row: '',
  },
  {
    id: 'followup',
    command: '/followup',
    label: 'Follow-up Required',
    icon: 'event_repeat',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-800',
    badge: 'bg-blue-600 text-white',
    row: '',
  },
  {
    id: 'observation',
    command: '/observation',
    label: 'Under Observation',
    icon: 'visibility',
    dot: 'bg-yellow-500',
    chip: 'bg-yellow-100 text-yellow-800',
    badge: 'bg-yellow-500 text-slate-900',
    row: '',
  },
];

export function findAlertType(id) {
  return ALERT_TYPES.find((a) => a.id === id) || null;
}

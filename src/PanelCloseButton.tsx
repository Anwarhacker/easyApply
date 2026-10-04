export function PanelCloseButton({ label, onClick, disabled = false }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button type="button" className="panel-close-button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  </button>;
}

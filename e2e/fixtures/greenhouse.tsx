import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";

// Controlled React inputs, delayed menus and portalled options reproduce the
// integration contract inspected on Greenhouse without submitting user data.
function Select({ id, label, options, initial = "", reject = false, rejectOnBlur = false }: { id: string; label: string; options: string[]; initial?: string; reject?: boolean; rejectOnBlur?: boolean }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initial);
  useEffect(() => {
    setReady(false);
    if (!open) return;
    const timer = setTimeout(() => setReady(true), 180);
    return () => clearTimeout(timer);
  }, [open, query]);
  return <section data-testid={id}>
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <div className="select__control">
      {selected && <div className="select__single-value">{selected}</div>}
      <input id={id} className="select__input" role="combobox" aria-labelledby={`${id}-label`}
        aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }} onBlur={() => { setOpen(false); if (rejectOnBlur) setTimeout(() => setSelected(""), 400); }}
        onKeyDown={e => { if (e.key === "ArrowDown") setOpen(true); if (e.key === "Escape") setOpen(false); }} />
    </div>
    {open && ready && createPortal(<div role="listbox" id={`${id}-list`}>
      {options.filter(o => !query || o.toLowerCase().includes(query.toLowerCase())).map((o, index) =>
        <div role="option" aria-selected={selected === o} key={index} onMouseDown={e => e.preventDefault()}
          onClick={() => { if (!reject) setSelected(o); setQuery(""); setOpen(false); }}>{o}</div>)}
    </div>, document.body)}
  </section>;
}

const host = document.createElement("div");
document.body.append(host);
createRoot(host).render(<>
  <Select id="gh-country" label="Country" options={["British Indian Ocean Territory +246", "India +91"]} />
  <Select id="gh-city" label="Location (City)" options={["Bengaluru, Karnataka, India"]} />
  <Select id="gh-current" label="Current location" options={["Bengaluru"]} />
  <Select id="gh-notice" label="Is your Notice Period less than 30 days" options={["Yes", "No"]} />
  <Select id="gh-experience" label="Do you have experience working in BFSI Domain" options={["Yes", "No"]} />
  <Select id="gh-rest" label="Do you have experience in building RESTful APIs and microservices architecture." options={["Yes", "No"]} />
  <Select id="gh-unanswered" label="Do you have experience with Git" options={["Yes", "No"]} />
  <Select id="gh-consent" label="Capco Job Candidate Privacy Notice Acknowledgement" options={["Yes"]} />
  <Select id="gh-preserved" label="Preferred location" initial="Mumbai" options={["Bengaluru", "Mumbai"]} />
  <Select id="gh-missing" label="Preferred location" options={["Pune"]} />
  <Select id="gh-duplicate" label="Preferred location" options={["Bengaluru", "Bengaluru"]} />
  <Select id="gh-rejected" label="Preferred location" options={["Bengaluru"]} reject />
  <Select id="gh-blur-rejected" label="Preferred location" options={["Bengaluru"]} rejectOnBlur />
  <label>Linkedln Profile<input id="gh-linkedin" /></label>
</>);

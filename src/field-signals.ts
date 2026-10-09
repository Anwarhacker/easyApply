export type Control =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement;
function captionText(node: Element): string {
  // A wrapping label can include every option; option text is not a field label.
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll("input,textarea,select,option,script,style").forEach((el) => el.remove());
  return copy.textContent ?? "";
}
export function signals(el: Control): string[] {
  const root = el.getRootNode() as Document | ShadowRoot;
  const radioGroup = el.closest("[role='radiogroup']");
  const radioGroupLabels = radioGroup ? [
    radioGroup.getAttribute("aria-label") ?? "",
    (radioGroup.getAttribute("aria-labelledby") ?? "").split(/\s+/).map(id => root.getElementById?.(id)?.textContent ?? "").join(" "),
  ] : [];
  const directLabels = [
    ...radioGroupLabels,
    ...[...((el as HTMLInputElement).labels ?? [])].map(captionText),
    el.getAttribute("aria-label") ?? "",
    (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).map(id => root.getElementById?.(id)?.textContent ?? "").join(" "),
  ];
  const hasDirectLabel = directLabels.some(text => text.trim());
  // Some sites render a floating label beside the control without label[for].
  // Only inspect a local container with one control, never the whole form.
  const nearbyLabels: string[] = [];
  let container = el.parentElement;
  for (
    let depth = 0;
    container && depth < 2;
    depth++, container = container.parentElement
  ) {
    const controls = container.querySelectorAll(
      "input,textarea,select,lyte-dropdown,lyte-select,crm-select,crm-dropdown,crm-multi-select,crux-select,crux-dropdown,crux-select-component,crux-dropdown-component,mat-select,p-dropdown,el-select,v-select,[data-zcui*='select'],[data-zcui*='dropdown'],[data-component*='select'],[data-component*='dropdown'],[data-field-type*='select'],[data-field-type*='dropdown'],[role='combobox'],[role='listbox'],[aria-haspopup='listbox']"
    );
    if (
      container.matches("form,body,fieldset") ||
      controls.length > 1
    )
      break;
    const candidates = [...container.querySelectorAll("label,span,p,.lyteFieldLabel,.crux-field-label,.field-label")].filter(
      (node) => {
        const target = node.getAttribute("for");
        return (
          (!target || target === el.id) &&
          !node.querySelector("input,textarea,select") &&
          node.getClientRects().length > 0
        );
      },
    );
    for (const node of candidates.slice(0, 8)) {
      const value = node.textContent?.trim() ?? "";
      if (value && value.length <= 100 && !nearbyLabels.includes(value))
        nearbyLabels.push(value);
    }
  }

  // Row containers often hold combined controls like (Country Code + Phone)
  const row = el.closest(
    ".crc-form-row, .form-row, .form-group, crux-phone-component, crux-text-component, crux-select-component, crux-dropdown-component, crux-field-component, .crux-field, lyte-field, tr"
  );
  if (row) {
    const rowLabel = row.querySelector("label, .lyteFieldLabel, [cx-prop-label], [lt-prop-label]");
    if (rowLabel && (!rowLabel.getAttribute("for") || rowLabel.getAttribute("for") === el.id) &&
      row.querySelectorAll("label, .lyteFieldLabel, [cx-prop-label], [lt-prop-label]").length === 1) {
      const lbl = (
        rowLabel.getAttribute("cx-prop-label") ||
        rowLabel.getAttribute("lt-prop-label") ||
        captionText(rowLabel) ||
        ""
      ).trim();
      if (lbl && lbl.length <= 100 && !nearbyLabels.includes(lbl)) {
        nearbyLabels.push(lbl);
      }
    }
  }

  // Zoho/Lyte components keep their semantic label on a wrapper, not the input.
  const component = el.closest("[cx-prop-label], [lt-prop-label]");
  const componentLabel =
    component?.getAttribute("cx-prop-label") ??
    component?.getAttribute("lt-prop-label") ??
    "";
  const wrapper = el.closest("[data-zcqa]");
  const wrapperName =
    wrapper
      ?.getAttribute("data-zcqa")
      ?.replace(/^(manual|rec)_/, "")
      .replace(/_/g, " ") ?? "";
  const selfZcqa =
    el.getAttribute("data-zcqa")?.replace(/^(manual|rec)_/, "").replace(/_/g, " ") ?? "";
  return [
    ...directLabels,
    el.getAttribute("lt-prop-title") ?? "",
    el.getAttribute("lt-prop-label") ?? "",
    el.getAttribute("title") ?? "",
    el.getAttribute("data-label") ?? "",
    el.getAttribute("data-field") ?? "",
    componentLabel,
    wrapperName,
    selfZcqa,
    ...(hasDirectLabel ? [] : nearbyLabels),
    el.getAttribute("placeholder") ?? el.getAttribute("lt-prop-placeholder") ?? "",
    (el as HTMLInputElement).name ?? "",
    el.id ?? "",
    el.getAttribute("autocomplete") ?? "",
    el instanceof HTMLInputElement && el.type === "email" ? "email" : "",
    el.closest("fieldset")?.querySelector("legend")?.textContent ?? "",
  ];
}

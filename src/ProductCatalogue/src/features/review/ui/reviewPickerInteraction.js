// A Review sidebar render replaces the picker DOM synchronously. Keep only the
// in-progress input interaction, never a draft from an unrelated focused field.
export function captureReviewPickerInteraction(page, activeElement = document.activeElement) {
  if (!activeElement || !page.contains(activeElement)) return null;
  const picker = activeElement.closest?.(".pc-product-picker");
  if (!picker) return null;

  const input = picker.querySelector(".pc-product-picker__input");
  const inputFocused = activeElement === input;
  const committed =
    picker.dataset?.productPickerCommitted === "true" ||
    input?.dataset?.productPickerSuppressResults === "true";
  return {
    // Preserve typing, but not a selected Product's old query, across rerenders.
    draft: inputFocused && !committed ? input.value : null,
    selectionStart: inputFocused && !committed ? input.selectionStart : null,
    selectionEnd: inputFocused && !committed ? input.selectionEnd : null,
    committed,
  };
}

export function restoreReviewPickerInteraction(page, interaction) {
  if (!interaction) return;
  const replacement = page.querySelector(".pc-product-picker__input");
  if (!replacement) return;

  if (interaction.draft !== null) replacement.value = interaction.draft;
  if (interaction.committed) {
    // Focusing the replacement input must not reopen the suggestions after Add.
    replacement.dataset.productPickerSuppressResults = "true";
  }
  replacement.focus({ preventScroll: true });
  if (interaction.committed) {
    const results = replacement
      .closest?.(".pc-product-picker")
      ?.querySelector?.(".pc-product-picker__results");
    if (results) results.hidden = true;
    replacement.setAttribute("aria-expanded", "false");
  }
  if (
    interaction.draft !== null &&
    Number.isInteger(interaction.selectionStart) &&
    Number.isInteger(interaction.selectionEnd)
  ) {
    replacement.setSelectionRange?.(interaction.selectionStart, interaction.selectionEnd);
  }
}

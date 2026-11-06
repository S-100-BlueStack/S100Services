// A Review sidebar render replaces the picker DOM synchronously. Keep only the
// in-progress input interaction, never a draft from an unrelated focused field.
export function captureReviewPickerInteraction(page, activeElement = document.activeElement) {
  if (!activeElement || !page.contains(activeElement)) return null;
  const picker = activeElement.closest?.(".pc-product-picker");
  if (!picker) return null;

  const input = picker.querySelector(".pc-product-picker__input");
  const inputFocused = activeElement === input;
  return {
    // Selecting a suggestion clears the old picker; do not resurrect its query.
    draft: inputFocused ? input.value : null,
    selectionStart: inputFocused ? input.selectionStart : null,
    selectionEnd: inputFocused ? input.selectionEnd : null,
  };
}

export function restoreReviewPickerInteraction(page, interaction) {
  if (!interaction) return;
  const replacement = page.querySelector(".pc-product-picker__input");
  if (!replacement) return;

  if (interaction.draft !== null) replacement.value = interaction.draft;
  replacement.focus({ preventScroll: true });
  if (
    interaction.draft !== null &&
    Number.isInteger(interaction.selectionStart) &&
    Number.isInteger(interaction.selectionEnd)
  ) {
    replacement.setSelectionRange?.(interaction.selectionStart, interaction.selectionEnd);
  }
}

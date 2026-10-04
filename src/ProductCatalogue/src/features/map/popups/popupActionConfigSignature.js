export function createActionConfigSignature(actionConfig) {
  return JSON.stringify(createActionConfigSnapshot(actionConfig));
}

function createActionConfigSnapshot(actionConfig) {
  return {
    id: actionConfig?.id ?? null,
    label: actionConfig?.label ?? "",
    ariaLabel: actionConfig?.ariaLabel ?? null,
    helpText: actionConfig?.helpText ?? null,
    icon: actionConfig?.icon ?? null,
    textEnabled: actionConfig?.textEnabled !== false,
    loading: actionConfig?.loading === true,
    disabled: actionConfig?.disabled === true,
    disabledReason: actionConfig?.disabledReason ?? null,
    className: actionConfig?.className ?? null,
    items: Array.isArray(actionConfig?.items)
      ? actionConfig.items.map((item) => createActionConfigSnapshot(item))
      : null,
  };
}

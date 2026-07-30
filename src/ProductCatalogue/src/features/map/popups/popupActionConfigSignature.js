export function createActionConfigSignature(actionConfig) {
  return JSON.stringify(createActionConfigSnapshot(actionConfig));
}

function createActionConfigSnapshot(actionConfig) {
  return {
    id: actionConfig?.id ?? null,
    label: actionConfig?.label ?? "",
    icon: actionConfig?.icon ?? null,
    loading: actionConfig?.loading === true,
    disabled: actionConfig?.disabled === true,
    disabledReason: actionConfig?.disabledReason ?? null,
    className: actionConfig?.className ?? null,
    items: Array.isArray(actionConfig?.items)
      ? actionConfig.items.map((item) => createActionConfigSnapshot(item))
      : null,
  };
}

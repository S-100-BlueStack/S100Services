import { trimBindingComment } from "../../../shared/api/bindingComments.js";

// A readback only confirms the operation applied to this Workstream with this text.
export function confirmedBindingCommentIds(drafts, comments) {
  const savedById = new Map(comments.map((comment) => [comment.id, comment]));
  return drafts
    .filter((draft) => {
      const saved = savedById.get(draft.id);
      return (
        saved?.pipelineId === draft.workStreamId && saved.text === trimBindingComment(draft.text)
      );
    })
    .map((draft) => draft.id);
}

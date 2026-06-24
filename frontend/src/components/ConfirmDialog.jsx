/**
 * ConfirmDialog.jsx - Generic confirmation modal for destructive actions.
 *
 * Used before anything that can't be easily undone (deleting a person,
 * rejecting a contribution). Keeps the "are you sure?" UI consistent
 * instead of relying on the browser's native confirm().
 */

function ConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm, onCancel, language }) {
  const isAr = language === "ar";

  return (
    <div className="confirm-overlay">
      <div className={`confirm-dialog ${isAr ? "rtl" : "ltr"}`}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>
            {cancelLabel ?? (isAr ? "إلغاء" : "Cancel")}
          </button>
          <button className="confirm-danger" onClick={onConfirm}>
            {confirmLabel ?? (isAr ? "تأكيد" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;

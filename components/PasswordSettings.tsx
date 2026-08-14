"use client";

import { CheckCircle2, KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  email: string;
  onClose: () => void;
  onNotify: (message: string) => void;
};

export default function PasswordSettings({ email, onClose, onNotify }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    if (!currentPassword) return setFeedback({ tone: "error", text: "Digite sua senha atual." });
    if (newPassword.length < 8) return setFeedback({ tone: "error", text: "A nova senha precisa ter pelo menos 8 caracteres." });
    if (newPassword === currentPassword) return setFeedback({ tone: "error", text: "Escolha uma senha diferente da atual." });
    if (newPassword !== confirmation) return setFeedback({ tone: "error", text: "A confirmação não corresponde à nova senha." });

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    if (error) {
      setFeedback({ tone: "error", text: "A senha atual não foi confirmada ou a nova senha não atende aos requisitos." });
      setSaving(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setSaving(false);
    setFeedback({ tone: "success", text: "Senha alterada com segurança." });
    onNotify("Senha alterada com sucesso.");
  }

  return (
    <form className="utility-modal password-settings" onSubmit={changePassword}>
      <div className="modal-icon mint"><KeyRound size={22} /></div>
      <span className="eyebrow">CONFIGURAÇÕES DA CONTA</span>
      <h2>Trocar senha</h2>
      <p>Confirme sua senha atual antes de definir uma nova senha para <strong>{email}</strong>.</p>
      <div className="password-settings-fields">
        <label>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Sua senha atual" /></label>
        <label>Nova senha<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Pelo menos 8 caracteres" /></label>
        <label>Confirmar nova senha<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repita a nova senha" /></label>
      </div>
      <div className="password-security-note"><LockKeyhole size={17} /><span>A senha é enviada diretamente ao serviço de autenticação e não fica armazenada no MAPA.</span></div>
      {feedback && <div className={`auth-feedback ${feedback.tone}`} role="status">{feedback.tone === "success" && <CheckCircle2 size={17} />}{feedback.text}</div>}
      <div className="modal-actions">
        <button type="button" className="button ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />} Alterar senha</button>
      </div>
    </form>
  );
}

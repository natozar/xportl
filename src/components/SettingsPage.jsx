import { useState } from 'react';
import { signOut } from '../services/auth';
import { exportUserData, requestAccountDeletion } from '../services/lgpd';

export default function SettingsPage({ session, onBack }) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  const userId = session?.user?.id;

  const handleExport = async () => {
    if (exporting || !userId) return;
    setExporting(true);
    try {
      await exportUserData(userId);
    } catch (err) {
      console.error('[XPortl] Export failed:', err);
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (deleting || !userId) return;
    setDeleting(true);
    try {
      const result = await requestAccountDeletion(userId);
      setDeleteResult(result.message);
    } catch (err) {
      console.error('[XPortl] Deletion failed:', err);
    }
    setDeleting(false);
  };

  const handleLogout = async () => {
    await signOut();
    window.location.reload();
  };

  if (deleteResult) {
    return (
      <div style={s.container}>
        <div style={s.scroll}>
          <div style={s.deleteSuccess}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12 }}>
              <circle cx="12" cy="12" r="10" stroke="#00f0ff" strokeWidth="1.5" />
              <path d="M8 12l3 3 5-6" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h3 style={s.deleteSuccessTitle}>Conta marcada para exclusao</h3>
            <p style={s.deleteSuccessText}>{deleteResult}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.scroll}>
        {/* Header */}
        <div style={s.header}>
          <button style={s.backBtn} onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <h2 style={s.title}>CONFIGURACOES</h2>
        </div>

        {/* Legal section */}
        <div style={s.sectionLabel}>LEGAL</div>
        <div style={s.group}>
          <LinkItem label="Termos de Uso" href="/TERMOS_DE_USO.md" />
          <LinkItem label="Politica de Privacidade" href="/POLITICA_DE_PRIVACIDADE.md" />
        </div>

        {/* LGPD section */}
        <div style={s.sectionLabel}>SEUS DADOS (LGPD)</div>
        <div style={s.group}>
          <button style={s.item} onClick={handleExport} disabled={exporting}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 12, opacity: 0.4 }}>
              <path d="M12 4v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={s.itemText}>{exporting ? 'Exportando...' : 'Exportar meus dados'}</span>
            <span style={s.itemHint}>JSON</span>
          </button>

          <button style={{ ...s.item, ...s.itemDanger }} onClick={() => setConfirmDelete(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 12, opacity: 0.5 }}>
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-1 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V6h10z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span style={s.itemText}>Excluir minha conta</span>
          </button>
        </div>

        {/* Confirm delete modal */}
        {confirmDelete && (
          <div style={s.confirmBox}>
            <p style={s.confirmText}>
              Tem certeza? Seus dados pessoais serao apagados. Registros de acesso serao retidos por 6 meses (Marco Civil Art. 15).
            </p>
            <div style={s.confirmActions}>
              <button style={s.confirmCancel} onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button style={s.confirmDanger} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Excluindo...' : 'Confirmar exclusao'}
              </button>
            </div>
          </div>
        )}

        {/* Account */}
        <div style={s.sectionLabel}>CONTA</div>
        <div style={s.group}>
          <button style={s.item} onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 12, opacity: 0.4 }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={s.itemText}>Sair da conta</span>
          </button>
        </div>

        <p style={s.version}>XPortl v1.0.0</p>
      </div>
    </div>
  );
}

function LinkItem({ label, href }) {
  return (
    <a style={s.item} href={href} target="_blank" rel="noopener noreferrer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 12, opacity: 0.4 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span style={s.itemText}>{label}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', opacity: 0.15 }}>
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </a>
  );
}

const s = {
  container: {
    position: 'fixed', inset: 0, background: 'var(--bg-void)',
    zIndex: 50, pointerEvents: 'auto',
    paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
  },
  scroll: { height: '100%', overflowY: 'auto', padding: '16px 20px' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)',
  },
  title: { fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-primary)', margin: 0 },
  sectionLabel: {
    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.2)', marginBottom: 8, marginTop: 20,
  },
  group: {
    display: 'flex', flexDirection: 'column', gap: 2,
    background: 'rgba(255,255,255,0.015)', borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.03)', overflow: 'hidden',
  },
  item: {
    display: 'flex', alignItems: 'center', padding: '14px 16px',
    background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.02)',
    color: 'var(--text-primary)', fontSize: '0.78rem', fontFamily: 'inherit',
    textDecoration: 'none', width: '100%', textAlign: 'left',
  },
  itemDanger: { color: '#ff3366' },
  itemText: { flex: 1 },
  itemHint: { fontSize: '0.55rem', color: 'var(--text-muted)', marginLeft: 8 },
  confirmBox: {
    margin: '12px 0', padding: '16px', borderRadius: 14,
    background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.12)',
  },
  confirmText: { fontSize: '0.7rem', color: 'rgba(255,51,102,0.7)', lineHeight: 1.6, marginBottom: 12 },
  confirmActions: { display: 'flex', gap: 8 },
  confirmCancel: {
    flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)',
    fontSize: '0.72rem', fontFamily: 'inherit',
  },
  confirmDanger: {
    flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(255,51,102,0.1)',
    border: '1px solid rgba(255,51,102,0.2)', color: '#ff3366',
    fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
  },
  version: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.1)', textAlign: 'center', marginTop: 32 },
  deleteSuccess: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', paddingTop: 80,
  },
  deleteSuccessTitle: { fontSize: '0.85rem', fontWeight: 700, color: '#00f0ff', margin: 0 },
  deleteSuccessText: { fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8, maxWidth: 300 },
};

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { vendorAuditAPI } from '../services/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Envelope, ArrowClockwise, CheckCircle, Warning, Eye } from '@phosphor-icons/react';

const STATUS_COLOR = {
  sent: 'bg-[#7D9D85]/15 text-[#4A6C52]',
  outbox_only: 'bg-[#5A7BA8]/15 text-[#3D5A85]',
  queued: 'bg-[#A28B7A]/15 text-[#A28B7A]',
  failed: 'bg-[#D96C5B]/15 text-[#A3402E]',
};

export default function EmailOutboxPanel() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);

  useEffect(() => { fetchEmails(); }, []);

  async function fetchEmails() {
    setLoading(true);
    try {
      const r = await vendorAuditAPI.listOutbox();
      setEmails(r.data || []);
    } catch (e) { toast.error('Failed to load outbox'); }
    setLoading(false);
  }

  async function retry(e) {
    try { await vendorAuditAPI.retryEmail(e.id); toast.success('Re-queued'); fetchEmails(); }
    catch (err) { toast.error('Retry failed'); }
  }

  return (
    <div className="space-y-3" data-testid="email-outbox-panel">
      <div className="bg-[#F9F6F0] rounded-lg p-3 text-xs text-[#6A625E]">
        <b>Zero-cost outbox mode.</b> No email provider is configured. All emails are captured here for admin review. To enable real delivery, set <code>RESEND_API_KEY</code> (or <code>SENDGRID_API_KEY</code>) + <code>EMAIL_FROM</code> in backend/.env.
      </div>

      {loading && <p className="text-sm text-[#6A625E]">Loading...</p>}
      {!loading && emails.length === 0 && <div className="text-center py-12 bg-white border border-[#E8E2D9] rounded-xl text-sm text-[#A28B7A]">No emails yet</div>}

      <div className="space-y-1">
        {emails.map(e => (
          <div key={e.id} className="flex items-center justify-between bg-white border border-[#E8E2D9] rounded-lg p-3 hover:border-[#D96C5B] transition">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Envelope size={16} className="text-[#D96C5B] mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#2A2624] truncate">{e.subject}</p>
                <p className="text-xs text-[#6A625E] truncate">To: {e.to} · {new Date(e.created_at).toLocaleString()} · <span className="uppercase text-[10px]">{e.kind}</span></p>
                {e.error && <p className="text-xs text-[#D96C5B] mt-1">⚠ {e.error}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${STATUS_COLOR[e.status] || 'bg-[#A28B7A]/15 text-[#A28B7A]'}`}>{e.status.replace(/_/g,' ')}</span>
              <Button size="sm" variant="ghost" onClick={() => setView(e)} title="View"><Eye size={14} /></Button>
              {e.status === 'failed' && <Button size="sm" variant="ghost" onClick={() => retry(e)} title="Retry"><ArrowClockwise size={14} /></Button>}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-[#E8E2D9]">
            <DialogTitle className="truncate">{view?.subject}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-3 text-xs text-[#6A625E] border-b border-[#E8E2D9]">
            <p><b>To:</b> {view?.to}</p>
            <p><b>Kind:</b> {view?.kind} · <b>Status:</b> {view?.status} · <b>Provider:</b> {view?.provider || '—'}</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {view && <iframe title="email" className="w-full h-[60vh] border-0" srcDoc={view.body_html} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

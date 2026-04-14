import React, { useEffect, useState, useCallback } from 'react';
import { notificationAPI } from '../services/api';
import { Bell, Check } from '@phosphor-icons/react';

export default function NotificationBell() {
  var [notifications, setNotifications] = useState([]);
  var [unread, setUnread] = useState(0);
  var [open, setOpen] = useState(false);

  var fetchNotifs = useCallback(async function() {
    try {
      var countRes = await notificationAPI.getUnreadCount();
      setUnread(countRes.data.count);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(function() {
    fetchNotifs();
    var interval = setInterval(fetchNotifs, 30000);
    return function() { clearInterval(interval); };
  }, [fetchNotifs]);

  async function handleOpen() {
    if (!open) {
      try {
        var res = await notificationAPI.getAll();
        setNotifications(res.data);
      } catch (e) { /* ignore */ }
    }
    setOpen(!open);
  }

  async function markAllRead() {
    try {
      await notificationAPI.markAllRead();
      setUnread(0);
      setNotifications(function(prev) { return prev.map(function(n) { return { ...n, read: true }; }); });
    } catch (e) { /* ignore */ }
  }

  var typeColor = function(type) {
    if (type === 'success') return 'border-l-[#7D9D85]';
    if (type === 'warning') return 'border-l-[#E8B25C]';
    if (type === 'error') return 'border-l-[#C65549]';
    return 'border-l-[#D96C5B]';
  };

  return (
    <div className="relative">
      <button onClick={handleOpen} className="relative p-2 hover:bg-[#D96C5B]/10 rounded-xl transition-colors" data-testid="notification-bell">
        <Bell size={22} className="text-[#2A2624]" weight={unread > 0 ? 'fill' : 'regular'} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#D96C5B] text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={function() { setOpen(false); }} />
          <div className="absolute right-0 top-12 w-80 bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_8px_30px_-4px_rgba(42,38,36,0.15)] z-50 overflow-hidden" data-testid="notification-panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E2D9]">
              <h4 className="font-semibold text-[#2A2624] text-sm">Notifications</h4>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-[#D96C5B] hover:text-[#C25949] font-medium flex items-center space-x-1">
                  <Check size={14} /><span>Mark all read</span>
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#6A625E]">No notifications</div>
              ) : (
                notifications.slice(0, 20).map(function(n) {
                  return (
                    <div key={n.id} className={'px-4 py-3 border-b border-[#E8E2D9] border-l-4 ' + typeColor(n.type) + (n.read ? ' opacity-60' : ' bg-[#FDFBF9]')}>
                      <p className="text-sm font-medium text-[#2A2624]">{n.title}</p>
                      <p className="text-xs text-[#6A625E] mt-0.5">{n.message}</p>
                      <p className="text-xs text-[#A28B7A] mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

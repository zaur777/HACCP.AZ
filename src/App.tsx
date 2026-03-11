import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  ClipboardList, 
  FileText, 
  Users, 
  Settings, 
  LogOut, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Check,
  Clock,
  Building2,
  ShieldCheck,
  ChevronRight,
  Menu,
  X,
  Thermometer,
  Droplets,
  Activity,
  Search,
  Globe,
  Database,
  Download,
  RefreshCw,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
  CreditCard,
  UserCircle,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from './services/api';
import { User, Company, JournalTemplate, LogEntry, HACCPPlan } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { geminiService } from './services/geminiService';
import { translations, Language } from './translations';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem('safeflow_view') || 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('safeflow_lang') as Language) || 'en');
  const [showLanding, setShowLanding] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [initialIsCreatingJournal, setInitialIsCreatingJournal] = useState(false);

  const t = translations[language];

  useEffect(() => {
    if (user) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setMessages(prev => [...prev, msg]);
      };
      
      setSocket(ws);
      return () => ws.close();
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('safeflow_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('safeflow_lang', language);
  }, [language]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const data = await api.auth.me();
      if (data.user) setUser(data.user);
    } catch (err: any) {
      // Only log if it's not a normal 401 (not logged in)
      if (!err.message?.includes('401')) {
        console.error('Auth check failed:', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    try {
      const data = await api.auth.login({ email, password });
      if (data.user) setUser(data.user);
      else alert(data.error || 'Login failed');
    } catch (err: any) {
      alert(err.message || 'Login failed');
    }
  };

  const handleRegisterCompany = async (e: React.FormEvent<HTMLFormElement> | HTMLFormElement): Promise<boolean> => {
    console.log('handleRegisterCompany called with:', e);
    
    let form: HTMLFormElement;
    if (e instanceof HTMLFormElement) {
      form = e;
    } else if (e && 'currentTarget' in e && e.currentTarget instanceof HTMLFormElement) {
      form = e.currentTarget;
    } else if (e && 'target' in e && e.target instanceof HTMLFormElement) {
      form = e.target;
    } else {
      console.error('Could not find form element in handleRegisterCompany');
      return false;
    }

    if (e && 'preventDefault' in e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    const formData = new FormData(form);
    const plan = formData.get('tariffPlan') as string;
    const data = {
      companyName: formData.get('companyName') as string,
      regNumber: formData.get('regNumber') as string,
      address: formData.get('address') as string,
      responsiblePerson: formData.get('responsiblePerson') as string,
      adminName: formData.get('adminName') as string,
      adminEmail: formData.get('adminEmail') as string,
      adminPassword: formData.get('adminPassword') as string,
      confirmPassword: formData.get('confirmPassword') as string,
      industryType: formData.get('industryType') as string,
      tariffPlan: plan,
      tariffDuration: plan === 'ENTERPRISE' ? 12 : (plan === 'PRO' ? 6 : 1),
    };

    console.log('Registration data prepared:', { ...data, adminPassword: '***', confirmPassword: '***' });

    if (!data.companyName || !data.adminEmail || !data.adminPassword || !data.adminName) {
      alert("Please fill in all required fields.");
      return false;
    }

    if (data.adminPassword !== data.confirmPassword) {
      alert(t.passwords_dont_match || "Passwords do not match");
      return false;
    }

    try {
      console.log('Registering company with data:', data);
      const res = await api.auth.registerCompany(data);
      if (res.success) {
        alert(t.registration_success || "Registration successful! Please wait for approval.");
        return true;
      } else {
        alert(res.error || 'Registration failed');
        return false;
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      alert('Registration failed: ' + (err.message || 'Unknown error'));
      return false;
    }
  };

  const handleLogout = async () => {
    await api.auth.logout();
    setUser(null);
    setView('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    if (showLanding) {
      return <LandingPage t={t} onSignIn={() => setShowLanding(false)} language={language} setLanguage={setLanguage} onRegister={handleRegisterCompany} />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4 relative">
        <div className="absolute top-4 left-4">
          <button 
            onClick={() => setShowLanding(true)}
            className="flex items-center gap-2 text-stone-500 hover:text-stone-900 font-medium transition-colors"
          >
            <ChevronRight size={18} className="rotate-180" />
            {t.back_to_home}
          </button>
        </div>
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-lg shadow-sm">
          <Globe size={16} className="text-stone-400 shrink-0" />
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="bg-transparent text-xs font-medium text-stone-600 outline-none cursor-pointer"
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="az">Azərbaycan</option>
          </select>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl shadow-stone-200/50 p-8 border border-stone-100"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="bg-emerald-100 p-3 rounded-xl mb-2">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900">SafeFood HACCP</h1>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Food facility HACCP management platform</p>
          </div>
          <p className="text-stone-500 text-center mb-8">{t.sign_in_desc}</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">{t.email_address}</label>
              <input 
                name="email"
                type="email" 
                required
                className="w-full px-4 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="admin@safeflow.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">{t.password}</label>
              <input 
                name="password"
                type="password" 
                required
                className="w-full px-4 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition-colors shadow-lg shadow-emerald-200"
            >
              {t.sign_in}
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm text-stone-400">
            <p>Demo Credentials:</p>
            <p>admin@safeflow.com / admin123</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (user.company_status === 'PENDING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-stone-100"
        >
          <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="text-amber-600 w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2">Account Pending Approval</h2>
          <p className="text-stone-500 mb-8">
            Your company registration is currently being reviewed by our Super Admin. 
            You will receive full access once your account is approved.
          </p>
          <button 
            onClick={handleLogout}
            className="w-full bg-stone-900 text-white font-semibold py-2 rounded-lg hover:bg-stone-800 transition-colors"
          >
            {t.logout}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        "bg-stone-900 text-stone-300 transition-all duration-300 flex flex-col",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-lg shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          {isSidebarOpen && <span className="font-bold text-white text-lg tracking-tight">SafeFood</span>}
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label={t.dashboard} 
            active={view === 'dashboard'} 
            onClick={() => setView('dashboard')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<ClipboardList size={20} />} 
            label={t.journals} 
            active={view === 'journals'} 
            onClick={() => setView('journals')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<FileText size={20} />} 
            label={t.haccp} 
            active={view === 'haccp'} 
            onClick={() => setView('haccp')}
            collapsed={!isSidebarOpen}
          />
          {(user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN') && (
            <NavItem 
              icon={<Users size={20} />} 
              label={t.staff} 
              active={view === 'users'} 
              onClick={() => setView('users')}
              collapsed={!isSidebarOpen}
            />
          )}
          {user.role === 'SUPER_ADMIN' && (
            <NavItem 
              icon={<Building2 size={20} />} 
              label={t.companies} 
              active={view === 'companies'} 
              onClick={() => setView('companies')}
              collapsed={!isSidebarOpen}
            />
          )}
          {user.role === 'SUPER_ADMIN' && (
            <NavItem 
              icon={<Database size={20} />} 
              label={t.backups} 
              active={view === 'backups'} 
              onClick={() => setView('backups')}
              collapsed={!isSidebarOpen}
            />
          )}
          {user.role === 'SUPER_ADMIN' && (
            <NavItem 
              icon={<ClipboardList size={20} />} 
              label={t.haccp_templates} 
              active={view === 'haccp_templates'} 
              onClick={() => setView('haccp_templates')}
              collapsed={!isSidebarOpen}
            />
          )}
          {user.role === 'SUPER_ADMIN' && (
            <NavItem 
              icon={<Settings size={20} />} 
              label={t.platform_settings} 
              active={view === 'platform_settings'} 
              onClick={() => setView('platform_settings')}
              collapsed={!isSidebarOpen}
            />
          )}
          <NavItem 
            icon={<MessageSquare size={20} />} 
            label={t.chat} 
            active={view === 'chat'} 
            onClick={() => setView('chat')}
            collapsed={!isSidebarOpen}
          />
          {user.role === 'COMPANY_ADMIN' && (
            <NavItem 
              icon={<CreditCard size={20} />} 
              label={t.tariffs} 
              active={view === 'tariffs'} 
              onClick={() => setView('tariffs')}
              collapsed={!isSidebarOpen}
            />
          )}
          <NavItem 
            icon={<CreditCard size={20} />} 
            label={t.payments} 
            active={view === 'payments'} 
            onClick={() => setView('payments')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<UserCircle size={20} />} 
            label={t.profile} 
            active={view === 'profile'} 
            onClick={() => setView('profile')}
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-stone-800 space-y-4">
          <div className={cn("flex items-center gap-2 px-3 py-2 bg-stone-800 rounded-lg", !isSidebarOpen && "justify-center")}>
            <Globe size={16} className="text-stone-400 shrink-0" />
            {isSidebarOpen && (
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-transparent text-xs font-medium text-stone-300 outline-none w-full cursor-pointer"
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="az">Azərbaycan</option>
              </select>
            )}
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-stone-800 transition-colors text-stone-400 hover:text-white"
          >
            <LogOut size={20} />
            {isSidebarOpen && <span>{t.logout}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-8">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-stone-100 rounded-lg text-stone-500"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-stone-900">{user.name}</p>
              <p className="text-xs text-stone-500">{user.role.replace('_', ' ')}</p>
            </div>
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold">
              {user.name[0]}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'dashboard' && <Dashboard user={user} t={t} setView={(v) => {
                if (v === 'journals_create') {
                  setInitialIsCreatingJournal(true);
                  setView('journals');
                } else {
                  setView(v);
                }
              }} />}
              {view === 'journals' && <JournalsView user={user} t={t} initialIsCreating={initialIsCreatingJournal} onModalClose={() => setInitialIsCreatingJournal(false)} />}
              {view === 'haccp' && <HACCPView user={user} t={t} />}
              {view === 'users' && <UsersView user={user} t={t} />}
              {view === 'companies' && <CompaniesView user={user} t={t} />}
              {view === 'backups' && user.role === 'SUPER_ADMIN' && <BackupsView t={t} />}
              {view === 'haccp_templates' && user.role === 'SUPER_ADMIN' && <HACCPTemplatesView user={user} t={t} />}
              {view === 'platform_settings' && user.role === 'SUPER_ADMIN' && <PlatformSettingsView user={user} t={t} />}
              {view === 'chat' && <ChatView user={user} t={t} messages={messages} socket={socket} />}
              {view === 'tariffs' && <TariffsView user={user} t={t} />}
              {view === 'payments' && <PaymentsView t={t} />}
              {view === 'profile' && <ProfileView user={user} t={t} onUpdate={checkAuth} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group",
        active 
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
          : "hover:bg-stone-800 text-stone-400 hover:text-stone-200"
      )}
    >
      <span className={cn("shrink-0", active ? "text-white" : "group-hover:text-stone-200")}>
        {icon}
      </span>
      {!collapsed && <span className="font-medium">{label}</span>}
    </button>
  );
}

// --- Views ---

function BackupsView({ t }: { t: any }) {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchBackups = async () => {
    try {
      const data = await fetch('/api/backups').then(res => res.json());
      setBackups(data);
    } catch (err) {
      console.error('Failed to fetch backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      await fetch('/api/backups/trigger', { method: 'POST' });
      await fetchBackups();
    } catch (err) {
      alert('Failed to trigger backup');
    } finally {
      setTriggering(false);
    }
  };

  const handleDownload = (id: number, filename: string) => {
    window.open(`/api/backups/${id}/download`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">{t.backups}</h2>
          <p className="text-stone-500">Manage and download automated database backups.</p>
        </div>
        <button 
          onClick={handleTriggerBackup}
          disabled={triggering}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={triggering ? "animate-spin" : ""} />
          Manual Backup
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">ID</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Filename</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Created At</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-stone-400">Loading backups...</td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-stone-400">No backups found.</td>
              </tr>
            ) : backups.map(b => (
              <tr key={b.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-6 py-4 text-stone-400 font-mono text-xs">#{b.id}</td>
                <td className="px-6 py-4 font-medium text-stone-900">{b.filename}</td>
                <td className="px-6 py-4 text-stone-500 text-sm">
                  {new Date(b.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={() => handleDownload(b.id, b.filename)}
                    className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                    title="Download Backup"
                  >
                    <Download size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard({ user, t, setView }: { user: User, t: any, setView: (v: string) => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user.role === 'SUPER_ADMIN') {
      api.admin.stats().then(data => {
        setAdminStats(data);
        setLoading(false);
      });
    } else {
      Promise.all([
        api.logs.list(),
        api.correctiveActions.list()
      ]).then(([logsData, actionsData]) => {
        setLogs(logsData);
        setActions(actionsData);
        setLoading(false);
      });
    }
  }, [user.role]);

  const deviations = logs.filter(l => l.status === 'DEVIATION').length;
  const complianceScore = logs.length > 0 ? Math.round(((logs.length - deviations) / logs.length) * 100) : 100;

  const handleExport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('HACCP Compliance Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
    doc.text(`Compliance Score: ${complianceScore}%`, 20, 40);
    doc.text(`Total Logs: ${logs.length}`, 20, 50);
    doc.text(`Total Deviations: ${deviations}`, 20, 60);

    let y = 80;
    doc.setFontSize(14);
    doc.text('Recent Logs:', 20, y);
    y += 10;
    doc.setFontSize(10);
    logs.slice(0, 20).forEach((log, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${log.created_at} - ${log.journal_name} - ${log.status}`, 20, y);
      y += 7;
    });

    doc.save('haccp-report.pdf');
  };

  return (
    <div className="space-y-8">
      {user.role !== 'SUPER_ADMIN' && user.subscription_expires_at && (
        <div className={cn(
          "p-4 rounded-xl border flex items-center justify-between",
          new Date(user.subscription_expires_at) < new Date() 
            ? "bg-red-50 border-red-200 text-red-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        )}>
          <div className="flex items-center gap-3">
            <AlertCircle size={20} />
            <div>
              <p className="font-bold">
                {new Date(user.subscription_expires_at) < new Date() ? "Subscription Expired" : "Subscription Active"}
              </p>
              <p className="text-sm opacity-90">{t.expires_on}: {new Date(user.subscription_expires_at).toLocaleDateString()}</p>
            </div>
          </div>
          <button 
            onClick={() => setView('tariffs')}
            className="px-4 py-2 bg-white rounded-lg shadow-sm font-medium text-sm hover:bg-stone-50 transition-colors"
          >
            {t.change_tariff}
          </button>
        </div>
      )}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">{t.welcome}, {user.name}</h1>
          <p className="text-stone-500 mt-1">{user.role === 'SUPER_ADMIN' ? t.manage_platform : t.compliance_overview}</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="bg-white border border-stone-200 px-4 py-2 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors"
          >
            {t.export_report}
          </button>
        </div>
      </div>

      {user.role === 'SUPER_ADMIN' && adminStats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<Building2 className="text-emerald-600" />} label={t.total_companies} value={adminStats.totalCompanies} trend="Total" color="emerald" />
          <StatCard icon={<Clock className="text-amber-600" />} label={t.pending_registrations} value={adminStats.pendingCompanies} trend="Pending" color="amber" />
          <StatCard icon={<Users className="text-blue-600" />} label="Total Users" value={adminStats.totalUsers} trend="Total" color="blue" />
          <StatCard icon={<Activity className="text-purple-600" />} label="Total Logs" value={adminStats.totalLogs} trend="Total" color="purple" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            icon={<CheckCircle2 className="text-emerald-600" />} 
            label={t.compliance_score} 
            value={`${complianceScore}%`} 
            trend={complianceScore >= 95 ? "Excellent" : "Needs Attention"} 
            color="emerald"
          />
          <StatCard 
            icon={<AlertTriangle className="text-amber-600" />} 
            label={t.deviations} 
            value={actions.filter(a => a.status === 'OPEN').length.toString()} 
            trend={deviations > 0 ? `+${deviations} total` : "0 total"} 
            color="amber"
          />
          <StatCard 
            icon={<Clock className="text-blue-600" />} 
            label={t.total_logs} 
            value={logs.length.toString()} 
            trend="Lifetime" 
            color="blue"
          />
          <StatCard 
            icon={<Activity className="text-rose-600" />} 
            label={t.active_ccps} 
            value="2" 
            trend="Stable" 
            color="rose"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-stone-900">{t.recent_activity}</h3>
            <button className="text-emerald-600 text-sm font-medium hover:underline">{t.view_all}</button>
          </div>
          <div className="space-y-4">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between p-4 rounded-xl border border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="bg-stone-100 p-2 rounded-lg">
                    <ClipboardList className="w-5 h-5 text-stone-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-stone-900">{log.journal_name}</p>
                    <p className="text-xs text-stone-500">Logged by {log.user_name} • {new Date(log.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider",
                    log.status === 'APPROVED' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  )}>
                    {log.status}
                  </span>
                </div>
              </div>
            ))}
            {logs.length === 0 && !loading && user.role !== 'SUPER_ADMIN' && (
              <p className="text-center py-8 text-stone-400 italic">No logs recorded yet.</p>
            )}
            {user.role === 'SUPER_ADMIN' && (
              <p className="text-center py-8 text-stone-400 italic">Platform activity summary.</p>
            )}
          </div>
        </div>

        {/* Alerts & Notifications */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-6">{user.role === 'SUPER_ADMIN' ? 'System Alerts' : t.corrective_actions}</h3>
          <div className="space-y-4">
            {user.role === 'SUPER_ADMIN' ? (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                <AlertCircle className="text-amber-600 shrink-0" size={20} />
                <div>
                  <p className="text-sm font-bold text-amber-900">Pending Registrations</p>
                  <p className="text-xs text-amber-700">You have {adminStats?.pendingCompanies || 0} companies waiting for approval.</p>
                </div>
              </div>
            ) : (
              <>
                {actions.filter(a => a.status === 'OPEN').map(action => (
                  <AlertItem 
                    key={action.id}
                    type="danger" 
                    title="CCP Deviation" 
                    desc={action.description} 
                    time={new Date(action.log_date).toLocaleDateString()} 
                  />
                ))}
                {actions.filter(a => a.status === 'OPEN').length === 0 && (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-12 h-12 text-emerald-100 mx-auto mb-3" />
                    <p className="text-stone-400 text-sm">All clear! No open deviations.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, color }: { icon: React.ReactNode, label: string, value: string, trend: string, color: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-lg", `bg-${color}-50`)}>
          {icon}
        </div>
        <span className={cn("text-xs font-bold px-2 py-1 rounded-full", 
          trend.startsWith('+') ? "bg-emerald-50 text-emerald-600" : 
          trend.startsWith('-') ? "bg-rose-50 text-rose-600" : "bg-stone-50 text-stone-600"
        )}>
          {trend}
        </span>
      </div>
      <p className="text-stone-500 text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold text-stone-900 mt-1">{value}</p>
    </div>
  );
}

function AlertItem({ type, title, desc, time }: { type: 'danger' | 'warning' | 'info', title: string, desc: string, time: string }) {
  const colors = {
    danger: "bg-rose-50 border-rose-100 text-rose-900",
    warning: "bg-amber-50 border-amber-100 text-amber-900",
    info: "bg-blue-50 border-blue-100 text-blue-900"
  };

  return (
    <div className={cn("p-4 rounded-xl border", colors[type])}>
      <div className="flex justify-between items-start mb-1">
        <p className="font-bold text-sm">{title}</p>
        <span className="text-[10px] opacity-60 font-medium">{time}</span>
      </div>
      <p className="text-xs opacity-80 leading-relaxed">{desc}</p>
    </div>
  );
}

function JournalsView({ user, t, initialIsCreating = false, onModalClose }: { user: User, t: any, initialIsCreating?: boolean, onModalClose?: () => void }) {
  const [journals, setJournals] = useState<JournalTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJournal, setActiveJournal] = useState<JournalTemplate | null>(null);
  const [isFilling, setIsFilling] = useState(false);
  const [isCreating, setIsCreating] = useState(initialIsCreating);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [newFields, setNewFields] = useState<{name: string, label: string, type: string}[]>([
    { name: 'staff_name', label: 'Name of staff', type: 'staff' },
    { name: 'date', label: 'Date', type: 'date' },
    { name: 'time', label: 'Time', type: 'time' },
    { name: 'action', label: 'Action', type: 'text' },
    { name: 'materials', label: 'Used materials', type: 'text' }
  ]);

  useEffect(() => {
    fetchJournals();
    fetchStaff();
    if (user.role === 'SUPER_ADMIN') {
      api.companies.list().then(setCompanies);
    }
    
    // Restore draft if exists
    const saved = localStorage.getItem('safeflow_draft_template');
    if (saved) {
      try {
        const { fields } = JSON.parse(saved);
        if (fields) setNewFields(fields);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (isCreating) {
      localStorage.setItem('safeflow_draft_template', JSON.stringify({ fields: newFields }));
    }
  }, [newFields, isCreating]);

  useEffect(() => {
    if (!isCreating && onModalClose) {
      onModalClose();
    }
  }, [isCreating]);

  const fetchJournals = () => {
    api.journals.list().then(data => {
      setJournals(data);
      setLoading(false);
    });
  };

  const fetchStaff = () => {
    api.users.list().then(data => setStaffList(data));
  };

  const handleExportLogs = async () => {
    try {
      const logs = await api.logs.list();
      const worksheet = XLSX.utils.json_to_sheet(logs.map(l => ({
        Date: l.created_at,
        Journal: l.journal_name,
        User: l.user_name,
        Status: l.status,
        Data: JSON.stringify(l.data),
        Deviations: l.deviation_notes || ''
      })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Logs");
      XLSX.writeFile(workbook, "haccp_logs.xlsx");
    } catch (err) {
      alert('Failed to export logs');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    
    // Validate field names
    if (newFields.some(f => !f.name || !f.name.trim())) {
      alert('All fields must have a name (ID)');
      setIsSaving(false);
      return;
    }

    const company_id_raw = formData.get('company_id');
    const company_id = company_id_raw === "" ? null : (company_id_raw ? Number(company_id_raw) : undefined);

    setIsSaving(true);
    try {
      await api.journals.create({ name, fields: newFields, company_id });
      localStorage.removeItem('safeflow_draft_template');
      alert('Template created!');
      setIsCreating(false);
      setNewFields([
        { name: 'staff_name', label: 'Name of staff', type: 'staff' },
        { name: 'date', label: 'Date', type: 'date' },
        { name: 'time', label: 'Time', type: 'time' },
        { name: 'action', label: 'Action', type: 'text' },
        { name: 'materials', label: 'Used materials', type: 'text' }
      ]);
      fetchJournals();
    } catch (err) {
      alert('Failed to create template');
    } finally {
      setIsSaving(false);
    }
  };

  const addField = () => {
    setNewFields([...newFields, { name: '', label: '', type: 'text' }]);
  };

  const removeField = (index: number) => {
    setNewFields(newFields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, key: string, value: string) => {
    const updated = [...newFields];
    updated[index] = { ...updated[index], [key]: value };
    setNewFields(updated);
  };

  const handleFillLog = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeJournal) return;
    
    const formData = new FormData(e.currentTarget);
    const data: any = {};
    const fields = typeof activeJournal.fields === 'string' ? JSON.parse(activeJournal.fields) : activeJournal.fields;
    fields.forEach((f: any) => {
      data[f.name] = f.type === 'number' ? Number(formData.get(f.name)) : formData.get(f.name);
    });

    setIsSaving(true);
    try {
      const result = await api.logs.create({ journal_id: activeJournal.id, data });
      alert(`Log submitted! Status: ${result.status}`);
      setIsFilling(false);
      setActiveJournal(null);
      // Refresh dashboard data if needed, or just let user navigate
    } catch (err) {
      alert('Failed to submit log');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportJournal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        if (!data.name || !data.fields) {
          throw new Error("Invalid template format. Must have 'name' and 'fields'.");
        }
        await api.journals.create(data);
        alert("Journal template imported successfully!");
        fetchJournals();
      } catch (err: any) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">{t.journals}</h2>
          <p className="text-stone-500">Manage and fill your digital compliance logs.</p>
        </div>
        <div className="flex gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportJournal} 
            className="hidden" 
            accept=".json"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-white border border-stone-200 px-4 py-2 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors flex items-center gap-2"
          >
            <Download size={18} />
            {t.import_journal}
          </button>
          <button 
            onClick={handleExportLogs}
            className="bg-white border border-stone-200 px-4 py-2 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors flex items-center gap-2"
          >
            <FileText size={18} />
            {t.export_logs}
          </button>
          {(user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN' || user.role === 'HACCP_MANAGER') && (
            <button 
              onClick={() => setIsCreating(true)}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors"
            >
              <Plus size={18} />
              {t.create_journal}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {journals.map(j => (
          <div key={j.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-stone-50 p-3 rounded-xl group-hover:bg-emerald-50 transition-colors">
                  <ClipboardList className="text-stone-400 group-hover:text-emerald-600" />
                </div>
                {j.company_id === null && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded uppercase tracking-wider">
                    {t.global_template}
                  </span>
                )}
              </div>
              <button className="text-stone-400 hover:text-stone-600">
                <Settings size={18} />
              </button>
            </div>
            <h3 className="font-bold text-stone-900 text-lg">{j.name}</h3>
            <p className="text-sm text-stone-500 mt-1">Ready for entry</p>
            <div className="mt-6 pt-6 border-t border-stone-100 flex gap-3">
              <button 
                onClick={() => { setActiveJournal(j); setIsFilling(true); }}
                className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                {t.fill_log}
              </button>
              <button className="px-3 py-2 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50 transition-colors">
                <FileText size={18} />
              </button>
            </div>
          </div>
        ))}
        
        {/* Empty State / Placeholder */}
        {journals.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-stone-200">
            <div className="bg-stone-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="text-stone-300 w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-stone-900">No journals found</h3>
            <p className="text-stone-500 mt-1 max-w-xs mx-auto">Start by creating your first electronic journal template.</p>
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-stone-900">{t.create_template}</h3>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('safeflow_draft_template');
                      setNewFields([
                        { name: 'staff_name', label: 'Name of staff', type: 'staff' },
                        { name: 'date', label: 'Date', type: 'date' },
                        { name: 'time', label: 'Time', type: 'time' },
                        { name: 'action', label: 'Action', type: 'text' },
                        { name: 'materials', label: 'Used materials', type: 'text' }
                      ]);
                    }}
                    className="text-xs font-bold text-stone-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
                  >
                    Reset
                  </button>
                  <button onClick={() => setIsCreating(false)} className="text-stone-400 hover:text-stone-600">
                    <X size={24} />
                  </button>
                </div>
              </div>
              <form onSubmit={handleCreateTemplate} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">{t.journal_name}</label>
                  <input name="name" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" placeholder="e.g. Production Log" />
                </div>

                {user.role === 'SUPER_ADMIN' && (
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Assign to Company</label>
                    <select name="company_id" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                      <option value="">Global (All Companies)</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-stone-500 italic">Global templates are visible to all companies.</p>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Fields</h4>
                    <button 
                      type="button" 
                      onClick={addField}
                      className="text-emerald-600 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus size={14} /> Add Field
                    </button>
                  </div>
                  
                  {newFields.map((field, index) => (
                    <div key={index} className="p-4 bg-stone-50 rounded-xl border border-stone-100 space-y-3 relative group">
                      <button 
                        type="button"
                        onClick={() => removeField(index)}
                        className="absolute -top-2 -right-2 bg-white border border-stone-200 text-stone-400 hover:text-rose-500 p-1 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Label</label>
                          <input 
                            value={field.label}
                            onChange={(e) => updateField(index, 'label', e.target.value)}
                            required 
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 outline-none" 
                            placeholder="e.g. Temperature"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">ID (Unique)</label>
                          <input 
                            value={field.name}
                            onChange={(e) => updateField(index, 'name', e.target.value)}
                            required 
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 outline-none" 
                            placeholder="e.g. temp"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Type</label>
                        <select 
                          value={field.type}
                          onChange={(e) => updateField(index, 'type', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 outline-none"
                        >
                          <option value="number">{t.number}</option>
                          <option value="text">{t.text}</option>
                          <option value="date">{t.date}</option>
                          <option value="time">{t.time}</option>
                          <option value="staff">{t.staff_name_list}</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsCreating(false)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors">{t.cancel}</button>
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : t.create_template}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fill Log Modal */}
      <AnimatePresence>
        {isFilling && activeJournal && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-stone-900">{activeJournal.name}</h3>
                <button onClick={() => setIsFilling(false)} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleFillLog} className="p-6 space-y-4">
                {(typeof activeJournal.fields === 'string' ? JSON.parse(activeJournal.fields) : activeJournal.fields).map((field: any) => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{field.label}</label>
                    {field.type === 'staff' ? (
                      <select 
                        name={field.name} 
                        required 
                        className="w-full px-4 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">{t.select_staff}</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        name={field.name}
                        type={field.type}
                        required
                        className="w-full px-4 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    )}
                  </div>
                ))}
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsFilling(false)}
                    className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : t.submit_log}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


function HACCPView({ user, t }: { user: User, t: any }) {
  const [plan, setPlan] = useState<HACCPPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSelectingTemplate, setIsSelectingTemplate] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(1);

  const tabs = [
    { id: 1, label: t.haccp_tabs[0], field: "product_description" },
    { id: 2, label: t.haccp_tabs[1], field: "flow_diagram" },
    { id: 3, label: t.haccp_tabs[2], field: "hazard_analysis" },
    { id: 4, label: t.haccp_tabs[3], field: "ccp_determination" },
    { id: 5, label: t.haccp_tabs[4], field: "critical_limits" },
    { id: 6, label: t.haccp_tabs[5], field: "monitoring_procedures" },
    { id: 7, label: t.haccp_tabs[6], field: "corrective_actions_plan" },
  ];

  useEffect(() => {
    fetchPlan();
    api.haccpTemplates.list().then(setTemplates).catch(console.error);
  }, []);

  const fetchPlan = () => {
    setLoading(true);
    api.haccpPlan.get()
      .then(data => setPlan(data))
      .catch(err => console.error("Failed to fetch plan:", err))
      .finally(() => setLoading(false));
  };

  const handleApplyTemplate = async (template: any) => {
    const updatedData = {
      ...(plan || {}),
      product_description: template.product_description,
      flow_diagram: template.flow_diagram,
      hazard_analysis: template.hazard_analysis,
      ccp_determination: template.ccp_determination,
      critical_limits: template.critical_limits,
      monitoring_procedures: template.monitoring_procedures,
      corrective_actions_plan: template.corrective_actions_plan,
      plan_date: new Date().toISOString().split('T')[0],
      plan_time: new Date().toTimeString().split(' ')[0].substring(0, 5)
    };

    try {
      await api.haccpPlan.update(updatedData);
      alert(`${template.name} template applied!`);
      setIsSelectingTemplate(false);
      fetchPlan();
    } catch (err) {
      alert('Failed to apply template');
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!plan) return;
    const formData = new FormData(e.currentTarget);
    
    setIsSaving(true);
    const updatedData = {
      ...plan,
      product_description: formData.get('product_description') as string || plan.product_description,
      flow_diagram: formData.get('flow_diagram') as string || plan.flow_diagram,
      hazard_analysis: formData.get('hazard_analysis') as string || plan.hazard_analysis,
      ccp_determination: formData.get('ccp_determination') as string || plan.ccp_determination,
      critical_limits: formData.get('critical_limits') as string || plan.critical_limits,
      monitoring_procedures: formData.get('monitoring_procedures') as string || plan.monitoring_procedures,
      corrective_actions_plan: formData.get('corrective_actions_plan') as string || plan.corrective_actions_plan,
      plan_date: formData.get('plan_date') as string || plan.plan_date,
      plan_time: formData.get('plan_time') as string || plan.plan_time,
    };
    
    try {
      await api.haccpPlan.update(updatedData);
      alert('Plan updated!');
      setIsEditing(false);
      fetchPlan();
    } catch (err) {
      alert('Failed to update plan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIAnalysis = async () => {
    if (!plan) return;
    if (!plan.product_description || plan.product_description.trim().length < 10) {
      alert("Please provide a more detailed product description before using AI analysis.");
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const results = await geminiService.analyzeHazards(plan.product_description);
      setAiAnalysis(results);
    } catch (err: any) {
      alert(err.message || "AI Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-stone-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">{t.haccp}</h2>
          <p className="text-stone-500">Hazard Analysis and Critical Control Points documentation.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsSelectingTemplate(true)}
            className="bg-white border border-stone-200 px-4 py-2 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors flex items-center gap-2"
          >
            <ClipboardList size={18} />
            Use Template
          </button>
          <button 
            onClick={handleAIAnalysis}
            disabled={isAnalyzing || !plan}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center gap-2 shadow-lg shadow-purple-100 disabled:opacity-50"
          >
            <Activity size={18} />
            {isAnalyzing ? t.analyzing : t.ai_risk_suggestion}
          </button>
          <button className="bg-white border border-stone-200 px-4 py-2 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors">
            {t.version_history}
          </button>
          <button 
            onClick={() => setIsEditing(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
          >
            {t.edit_plan}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-2">
          {tabs.map(tab => (
            <HACCPNavItem 
              key={tab.id} 
              label={tab.label} 
              active={activeTab === tab.id} 
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>

        <div className="lg:col-span-3 space-y-8">
          <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm">
            <div className="max-w-3xl">
              <h3 className="text-xl font-bold text-stone-900 mb-6">{tabs.find(t => t.id === activeTab)?.label.split('. ')[1]}</h3>
              {plan ? (
                <div className="space-y-6">
                  <section>
                    <h4 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Content</h4>
                    <p className="text-stone-900 font-medium whitespace-pre-wrap">
                      {(plan as any)[tabs.find(t => t.id === activeTab)?.field || 'product_description'] || 'No content yet.'}
                    </p>
                  </section>
                  <section>
                    <h4 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Plan Date & Time</h4>
                    <p className="text-stone-900 font-medium">
                      {plan.plan_date || 'N/A'} at {plan.plan_time || 'N/A'}
                    </p>
                  </section>
                  <section>
                    <h4 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Last Updated</h4>
                    <p className="text-stone-600 leading-relaxed">
                      {new Date(plan.updated_at).toLocaleString()} (Version {plan.version})
                    </p>
                  </section>
                </div>
              ) : (
                <p className="text-stone-400 italic">No plan data found.</p>
              )}
            </div>
          </div>

          {/* Edit Plan Modal */}
          <AnimatePresence>
            {isEditing && plan && (
              <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
                >
                  <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-stone-900">Edit HACCP Plan - {tabs.find(t => t.id === activeTab)?.label.split('. ')[1]}</h3>
                    <button onClick={() => setIsEditing(false)} className="text-stone-400 hover:text-stone-600">
                      <X size={24} />
                    </button>
                  </div>
                  <form onSubmit={handleUpdatePlan} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Plan Date</label>
                        <input 
                          name="plan_date" 
                          type="date" 
                          defaultValue={plan.plan_date || ''}
                          className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Plan Time</label>
                        <input 
                          name="plan_time" 
                          type="time" 
                          defaultValue={plan.plan_time || ''}
                          className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        {tabs.find(t => t.id === activeTab)?.label.split('. ')[1]}
                      </label>
                      <textarea 
                        name={tabs.find(t => t.id === activeTab)?.field} 
                        defaultValue={(plan as any)[tabs.find(t => t.id === activeTab)?.field || 'product_description']}
                        required 
                        rows={10}
                        className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none font-mono text-sm"
                      />
                    </div>
                    <div className="pt-4 flex gap-3">
                      <button type="button" onClick={() => setIsEditing(false)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors">Cancel</button>
                      <button 
                        type="submit" 
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSaving ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Saving...
                          </>
                        ) : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {isSelectingTemplate && (
              <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
                >
                  <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-stone-900">Select HACCP Template</h3>
                    <button onClick={() => setIsSelectingTemplate(false)} className="text-stone-400 hover:text-stone-600">
                      <X size={24} />
                    </button>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates.map((template) => (
                      <button 
                        key={template.id}
                        onClick={() => handleApplyTemplate(template)}
                        className="text-left p-0 rounded-2xl border border-stone-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group overflow-hidden"
                      >
                        <div className="h-32 w-full overflow-hidden">
                          <img 
                            src={template.image || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=800'} 
                            alt={template.name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="p-6">
                          <h4 className="font-bold text-stone-900 mb-1">{template.name}</h4>
                          <p className="text-xs text-stone-500 line-clamp-2">{template.product_description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="p-6 bg-stone-50 border-t border-stone-100 flex justify-end">
                    <button 
                      onClick={() => setIsSelectingTemplate(false)}
                      className="px-4 py-2 text-stone-600 font-medium hover:text-stone-900"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {aiAnalysis.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-purple-50 rounded-2xl border border-purple-100 p-8 shadow-sm"
            >
              <h3 className="text-xl font-bold text-purple-900 mb-6 flex items-center gap-2">
                <ShieldCheck className="text-purple-600" />
                AI Suggested Hazard Analysis
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiAnalysis.map((h, i) => (
                  <div key={i} className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-purple-100 text-purple-700 rounded">
                        {h.type}
                      </span>
                    </div>
                    <p className="font-bold text-stone-900 text-sm mb-1">{h.hazard}</p>
                    <p className="text-xs text-stone-500 leading-relaxed">Control: {h.control_measure}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function HACCPNavItem({ label, active, onClick }: { label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 rounded-xl font-medium transition-all",
        active ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "text-stone-500 hover:bg-stone-100"
      )}
    >
      {label}
    </button>
  );
}

function LandingPage({ t, onSignIn, language, setLanguage, onRegister }: { t: any, onSignIn: () => void, language: Language, setLanguage: (l: Language) => void, onRegister: (e: React.FormEvent<HTMLFormElement> | HTMLFormElement) => Promise<boolean> }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-stone-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-600 p-1.5 rounded-lg">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-stone-900 tracking-tight">SafeFood</span>
              </div>
              <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider leading-none mt-0.5">Food facility HACCP management platform</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">{t.features}</a>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 rounded-lg">
                <Globe size={14} className="text-stone-400" />
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  className="bg-transparent text-xs font-medium text-stone-600 outline-none cursor-pointer"
                >
                  <option value="en">EN</option>
                  <option value="ru">RU</option>
                  <option value="az">AZ</option>
                </select>
              </div>
              <button 
                onClick={onSignIn}
                className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
              >
                {t.sign_in}
              </button>
              <button 
                onClick={() => setIsRegistering(true)}
                className="bg-emerald-600 text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200/50"
              >
                {t.register_company}
              </button>
            </div>
            
            <button className="md:hidden text-stone-500">
              <Menu size={24} />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-6">
                <Activity size={14} />
                {t.safe_flow_desc}
              </div>
              <h1 className="text-5xl lg:text-7xl font-bold text-stone-900 leading-[1.1] tracking-tight mb-6">
                {t.hero_title}
              </h1>
              <p className="text-xl text-stone-500 leading-relaxed mb-10 max-w-xl">
                {t.hero_subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => setIsRegistering(true)}
                  className="bg-emerald-600 text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200/50 flex items-center justify-center gap-2 group"
                >
                  {t.get_started}
                  <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
                <button 
                  onClick={onSignIn}
                  className="bg-white border border-stone-200 text-stone-900 px-8 py-4 rounded-full text-lg font-bold hover:bg-stone-50 transition-all flex items-center justify-center"
                >
                  {t.sign_in}
                </button>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80" 
                  alt="SafeFood Food Safety" 
                  className="w-full h-auto"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-emerald-100 rounded-full blur-3xl opacity-50"></div>
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-100 rounded-full blur-3xl opacity-50"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Registration Modal */}
      <AnimatePresence>
        {isRegistering && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-stone-900">{t.register_company}</h3>
                <button onClick={() => setIsRegistering(false)} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={async (e) => { 
                console.log('Registration form submit event triggered');
                e.preventDefault();
                const form = e.currentTarget;
                
                // Check browser validation
                if (!form.checkValidity()) {
                  console.log('Form validation failed');
                  form.reportValidity();
                  return;
                }

                setLoading(true);
                try {
                  console.log('Calling onRegister...');
                  const success = await onRegister(form); 
                  console.log('onRegister result:', success);
                  if (success) setIsRegistering(false); 
                } catch (err) {
                  console.error('Error in onSubmit:', err);
                  alert('An unexpected error occurred. Please try again.');
                } finally {
                  setLoading(false);
                }
              }} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.company_name} *</label>
                    <input name="companyName" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Registration Number</label>
                    <input name="regNumber" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.industry_type}</label>
                    <select name="industryType" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                      <option value="Catering">Catering</option>
                      <option value="Restaurant">Restaurant</option>
                      <option value="Food Production">Food Production</option>
                      <option value="Retail">Retail</option>
                      <option value="Logistics">Logistics</option>
                      <option value="Farm">Farm</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
                    <input name="address" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.admin_name} *</label>
                    <input name="adminName" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Responsible Person</label>
                    <input name="responsiblePerson" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.admin_email} *</label>
                    <input name="adminEmail" type="email" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.admin_password}</label>
                    <input name="adminPassword" type="password" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.confirm_password}</label>
                    <input name="confirmPassword" type="password" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.select_plan} *</label>
                    <select name="tariffPlan" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                      <option value="BASIC">{t.tariff_basic} (1 {t.monthly} + {t.one_month_free}) - {t.price_30}</option>
                      <option value="PRO">{t.tariff_pro} (6 {t.semi_annual} + {t.one_month_free}) - {t.price_150}</option>
                      <option value="ENTERPRISE">{t.tariff_enterprise} (12 {t.annual} + {t.one_month_free}) - {t.price_240}</option>
                    </select>
                  </div>
                </div>
                <div className="pt-4">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="animate-spin" size={20} />
                        {t.analyzing || 'Processing...'}
                      </>
                    ) : (
                      t.register_company
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Social Proof */}
      <section className="py-12 bg-white border-y border-stone-100">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-8">{t.trusted_by}</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-40 grayscale">
            <div className="text-2xl font-black text-stone-900 italic">FOODCORP</div>
            <div className="text-2xl font-black text-stone-900 italic">FRESHMART</div>
            <div className="text-2xl font-black text-stone-900 italic">SAFEKITCHEN</div>
            <div className="text-2xl font-black text-stone-900 italic">ECOFARM</div>
          </div>
        </div>
      </section>

      {/* Farm Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80" 
                  alt="Modern Farm" 
                  className="w-full h-[500px] object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
                  <p className="text-white font-medium italic">"Ensuring safety from the very first step of the supply chain."</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-4xl font-bold text-stone-900 mb-6">Farm-to-Fork Traceability</h2>
              <p className="text-lg text-stone-500 leading-relaxed mb-8">
                Our platform bridges the gap between agricultural production and consumer safety. Track pesticide controls, soil testing, and harvest hygiene directly within your HACCP ecosystem.
              </p>
              <ul className="space-y-4">
                {[
                  "Automated soil & water testing logs",
                  "Pesticide & fertilizer application tracking",
                  "Livestock health & vaccination records",
                  "Harvest hygiene & transport monitoring"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-stone-700 font-medium">
                    <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl font-bold text-stone-900 mb-6">{t.features}</h2>
            <p className="text-lg text-stone-500 leading-relaxed">
              Everything you need to manage food safety in one place. Built for compliance, designed for ease of use.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<FileText className="w-6 h-6 text-emerald-600" />}
              title={t.feature_haccp_title}
              desc={t.feature_haccp_desc}
            />
            <FeatureCard 
              icon={<ClipboardList className="w-6 h-6 text-blue-600" />}
              title={t.feature_journals_title}
              desc={t.feature_journals_desc}
            />
            <FeatureCard 
              icon={<Users className="w-6 h-6 text-purple-600" />}
              title={t.feature_staff_title}
              desc={t.feature_staff_desc}
            />
            <FeatureCard 
              icon={<Activity className="w-6 h-6 text-orange-600" />}
              title={t.feature_analytics_title}
              desc={t.feature_analytics_desc}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 lg:py-32 bg-stone-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500 rounded-full blur-[120px]"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">{t.ready_to_start}</h2>
          <p className="text-xl text-stone-400 mb-12 max-w-2xl mx-auto">
            {t.join_thousands}
          </p>
          <button 
            onClick={onSignIn}
            className="bg-emerald-600 text-white px-10 py-5 rounded-full text-xl font-bold hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-900/50"
          >
            {t.get_started}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-stone-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <span className="text-lg font-bold text-stone-900">SafeFood HACCP</span>
          </div>
          <p className="text-stone-400 text-sm">© 2024 SafeFood Compliance. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="text-stone-400 hover:text-stone-900 transition-colors">Privacy</a>
            <a href="#" className="text-stone-400 hover:text-stone-900 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
      <div className="bg-stone-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-stone-900 mb-4">{title}</h3>
      <p className="text-stone-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function UsersView({ user, t }: { user: User, t: any }) {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
    if (user.role === 'SUPER_ADMIN') {
      api.companies.list().then(setCompanies);
    }
  }, []);

  const fetchUsers = () => {
    api.users.list().then(data => {
      setUsers(data);
      setLoading(false);
    });
  };

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as string;
    const company_id = formData.get('company_id') ? Number(formData.get('company_id')) : undefined;

    setIsSaving(true);
    try {
      await api.users.create({ name, email, password, role, company_id });
      alert('User added!');
      setIsAdding(false);
      fetchUsers();
    } catch (err) {
      alert('Failed to add user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUser) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    const company_id = formData.get('company_id') ? Number(formData.get('company_id')) : undefined;

    setIsSaving(true);
    try {
      await api.users.update(editingUser.id, { name, email, role, company_id });
      alert('User updated!');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      alert('Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.users.delete(id);
      fetchUsers();
    } catch (err) {
      alert('Failed to delete user');
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await api.users.update(u.id, { is_active: !u.is_active });
      fetchUsers();
    } catch (err) {
      alert('Failed to toggle status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">{t.staff}</h2>
          <p className="text-stone-500">Manage employee access and roles.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors"
        >
          <Plus size={18} />
          {t.add_employee}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Email</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-stone-400">Loading staff...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-stone-400">No staff members found.</td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id} className={cn("hover:bg-stone-50 transition-colors", !u.is_active && "opacity-60")}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-600 font-bold text-xs uppercase">
                      {u.name[0]}
                    </div>
                    <span className="font-semibold text-stone-900">{u.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-stone-600 font-medium">{u.role.replace('_', ' ')}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-stone-500">{u.email}</span>
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={() => handleToggleActive(u)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                      u.is_active 
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                        : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    )}
                  >
                    {u.is_active ? (
                      <><ToggleRight size={14} /> Active</>
                    ) : (
                      <><ToggleLeft size={14} /> Passive</>
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setEditingUser(u)}
                      className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="Edit User"
                    >
                      <Edit size={16} />
                    </button>
                    {u.id !== user.id && (
                      <button 
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Delete User"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-stone-900">Add New Employee</h3>
                <button onClick={() => setIsAdding(false)} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Full Name</label>
                  <input name="name" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" placeholder="e.g. Jane Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                  <input name="email" type="email" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" placeholder="jane@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Initial Password</label>
                  <input name="password" type="password" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Role</label>
                  <select name="role" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                    <option value="EMPLOYEE">Employee / Operator</option>
                    <option value="HACCP_MANAGER">HACCP Manager</option>
                    <option value="COMPANY_ADMIN">Company Admin</option>
                    <option value="INSPECTOR">Inspector</option>
                  </select>
                </div>
                {user.role === 'SUPER_ADMIN' && (
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Assign to Company</label>
                    <select name="company_id" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                      <option value="">Global (No Company)</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors">Cancel</button>
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : 'Add Employee'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-stone-900">Edit Employee</h3>
                <button onClick={() => setEditingUser(null)} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleEditUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Full Name</label>
                  <input name="name" defaultValue={editingUser.name} required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                  <input name="email" type="email" defaultValue={editingUser.email} required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Role</label>
                  <select name="role" defaultValue={editingUser.role} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                    <option value="EMPLOYEE">Employee / Operator</option>
                    <option value="HACCP_MANAGER">HACCP Manager</option>
                    <option value="COMPANY_ADMIN">Company Admin</option>
                    <option value="INSPECTOR">Inspector</option>
                  </select>
                </div>
                {user.role === 'SUPER_ADMIN' && (
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Assign to Company</label>
                    <select name="company_id" defaultValue={editingUser.company_id || ''} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none">
                      <option value="">Global (No Company)</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setEditingUser(null)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors">Cancel</button>
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompaniesView({ user, t }: { user: User, t: any }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<number | null>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = () => {
    setLoading(true);
    api.companies.list().then(data => {
      setCompanies(data);
      setLoading(false);
    });
  };

  const handleUpdateStatus = async (id: number, status: 'APPROVED' | 'SUSPENDED') => {
    setIsUpdating(id);
    try {
      await api.admin.updateCompany(id, { status });
      fetchCompanies();
    } catch (err) {
      alert('Failed to update status');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleChangeTariff = async (id: number, tariff_plan: 'BASIC' | 'PRO' | 'ENTERPRISE') => {
    setIsUpdating(id);
    try {
      await api.admin.updateCompany(id, { tariff_plan });
      fetchCompanies();
    } catch (err) {
      alert('Failed to update tariff');
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">{t.companies}</h2>
          <p className="text-stone-500">Manage multi-tenant company accounts.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-stone-400">Loading companies...</div>
        ) : companies.length === 0 ? (
          <div className="col-span-full py-12 text-center text-stone-400">No companies found.</div>
        ) : companies.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-50 p-3 rounded-xl">
                  <Building2 className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">{c.name}</h3>
                  <p className="text-sm text-stone-500">{c.industry_type}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={cn(
                  "px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider",
                  c.status === 'APPROVED' ? "bg-emerald-100 text-emerald-700" :
                  c.status === 'PENDING' ? "bg-amber-100 text-amber-700" :
                  "bg-rose-100 text-rose-700"
                )}>
                  {c.status === 'APPROVED' ? t.approved : c.status === 'PENDING' ? t.pending_approval : t.suspended}
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">
                  {c.tariff_plan}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4 py-4 border-y border-stone-100">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Responsible Person</p>
                <p className="text-sm font-medium text-stone-900">{c.responsible_person}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Reg Number</p>
                <p className="text-sm font-medium text-stone-900">{c.reg_number}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Address</p>
                <p className="text-sm font-medium text-stone-900">{c.address}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {c.status === 'PENDING' && (
                <button 
                  onClick={() => handleUpdateStatus(c.id, 'APPROVED')}
                  disabled={isUpdating === c.id}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {t.approve}
                </button>
              )}
              {c.status === 'APPROVED' && (
                <button 
                  onClick={() => handleUpdateStatus(c.id, 'SUSPENDED')}
                  disabled={isUpdating === c.id}
                  className="flex-1 bg-rose-50 text-rose-600 py-2 rounded-lg text-sm font-bold hover:bg-rose-100 transition-colors disabled:opacity-50"
                >
                  {t.suspend}
                </button>
              )}
              {c.status === 'SUSPENDED' && (
                <button 
                  onClick={() => handleUpdateStatus(c.id, 'APPROVED')}
                  disabled={isUpdating === c.id}
                  className="flex-1 bg-emerald-50 text-emerald-600 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  Re-activate
                </button>
              )}
              
              <select 
                value={c.tariff_plan}
                onChange={(e) => handleChangeTariff(c.id, e.target.value as any)}
                disabled={isUpdating === c.id}
                className="flex-1 bg-white border border-stone-200 py-2 rounded-lg text-sm font-bold text-stone-600 outline-none disabled:opacity-50"
              >
                <option value="BASIC">{t.tariff_basic}</option>
                <option value="PRO">{t.tariff_pro}</option>
                <option value="ENTERPRISE">{t.tariff_enterprise}</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HACCPTemplatesView({ user, t }: { user: User, t: any }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = () => {
    setLoading(true);
    api.haccpTemplates.list().then(data => {
      setTemplates(data);
      setLoading(false);
    });
  };

  const handleCreateTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await api.haccpTemplates.create(data);
      setIsCreating(false);
      fetchTemplates();
    } catch (err) {
      alert('Failed to create template');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.haccpTemplates.delete(id);
      fetchTemplates();
    } catch (err) {
      alert('Failed to delete template');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">{t.haccp_templates}</h2>
          <p className="text-stone-500">{t.manage_haccp_templates}</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          {t.create_template}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-stone-400">Loading templates...</div>
        ) : templates.map(template => (
          <div key={template.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm group">
            <div className="h-40 relative overflow-hidden">
              <img 
                src={template.image || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=800'} 
                alt={template.name} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => handleDelete(template.id)}
                className="absolute top-2 right-2 p-2 bg-white/90 backdrop-blur-sm text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <div className="p-6">
              <h3 className="font-bold text-stone-900 mb-2">{template.name}</h3>
              <p className="text-sm text-stone-500 line-clamp-3 mb-4">{template.product_description}</p>
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <Calendar size={14} />
                {new Date(template.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-stone-900">Create HACCP Template</h3>
                <button onClick={() => setIsCreating(false)} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleCreateTemplate} className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Template Name</label>
                    <input name="name" required className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" placeholder="e.g. Meat Processing" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Image URL</label>
                    <input name="image" className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" placeholder="https://..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Product Description</label>
                    <textarea name="product_description" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Flow Diagram</label>
                    <textarea name="flow_diagram" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Hazard Analysis</label>
                    <textarea name="hazard_analysis" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">CCP Determination</label>
                    <textarea name="ccp_determination" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Critical Limits</label>
                    <textarea name="critical_limits" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Monitoring Procedures</label>
                    <textarea name="monitoring_procedures" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Corrective Actions Plan</label>
                    <textarea name="corrective_actions_plan" rows={3} className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none resize-none" />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsCreating(false)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 font-medium hover:bg-stone-50 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors">Create Template</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlatformSettingsView({ user, t }: { user: User, t: any }) {
  const [settings, setSettings] = useState({
    platformName: 'SafeFood HACCP',
    primaryColor: '#059669',
    enableRegistration: true,
    maintenanceMode: false
  });

  const handleSave = () => {
    alert('Platform settings updated!');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">{t.platform_settings}</h2>
        <p className="text-stone-500">{t.global_config}</p>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">{t.platform_name}</label>
          <input 
            value={settings.platformName}
            onChange={e => setSettings({...settings, platformName: e.target.value})}
            className="w-full px-4 py-2 rounded-lg border border-stone-200 outline-none" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">{t.primary_color}</label>
          <div className="flex gap-3">
            <input 
              type="color"
              value={settings.primaryColor}
              onChange={e => setSettings({...settings, primaryColor: e.target.value})}
              className="h-10 w-20 rounded border border-stone-200 cursor-pointer" 
            />
            <input 
              value={settings.primaryColor}
              onChange={e => setSettings({...settings, primaryColor: e.target.value})}
              className="flex-1 px-4 py-2 rounded-lg border border-stone-200 outline-none font-mono" 
            />
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-stone-900">{t.enable_registration}</p>
              <p className="text-xs text-stone-500">Allow new companies to register via landing page.</p>
            </div>
            <button 
              onClick={() => setSettings({...settings, enableRegistration: !settings.enableRegistration})}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.enableRegistration ? "bg-emerald-600" : "bg-stone-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.enableRegistration ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-stone-900">{t.maintenance_mode}</p>
              <p className="text-xs text-stone-500">Disable access for all users except Super Admins.</p>
            </div>
            <button 
              onClick={() => setSettings({...settings, maintenanceMode: !settings.maintenanceMode})}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.maintenanceMode ? "bg-rose-600" : "bg-stone-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.maintenanceMode ? "left-7" : "left-1"
              )} />
            </button>
          </div>
        </div>

        <div className="pt-6">
          <button 
            onClick={handleSave}
            className="w-full bg-stone-900 text-white py-3 rounded-lg font-bold hover:bg-stone-800 transition-colors"
          >
            Save Platform Config
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user, t, onUpdate }: { user: User, t: any, onUpdate: () => void }) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string || undefined,
      company_name: formData.get('company_name') as string,
      industry_type: formData.get('industry_type') as string,
      reg_number: formData.get('reg_number') as string,
      address: formData.get('address') as string,
      phone_number: formData.get('phone_number') as string,
      facility_addresses: formData.get('facility_addresses') as string,
    };

    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        alert('Profile updated!');
        onUpdate();
      } else {
        const err = await res.json();
        alert(err.error || 'Update failed');
      }
    } catch (err) {
      alert('Update failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-emerald-100 p-3 rounded-xl">
            <UserCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900">{t.profile}</h2>
            <p className="text-stone-500">{user.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">{t.full_name}</label>
              <input 
                name="name"
                type="text" 
                defaultValue={user.name}
                required
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">{t.email_address}</label>
              <input 
                name="email"
                type="email" 
                defaultValue={user.email}
                required
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
          </div>

          {(user.role === 'COMPANY_ADMIN' || user.role === 'HACCP_MANAGER') && (
            <>
              <div className="pt-4 border-t border-stone-100">
                <h3 className="text-lg font-bold text-stone-900 mb-4">{t.register_company}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.company_name}</label>
                    <input 
                      name="company_name"
                      type="text" 
                      defaultValue={user.company_name}
                      required
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.industry_type}</label>
                    <input 
                      name="industry_type"
                      type="text" 
                      defaultValue={user.industry_type}
                      required
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.tax_id}</label>
                    <input 
                      name="reg_number"
                      type="text" 
                      defaultValue={user.reg_number}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.phone_number}</label>
                    <input 
                      name="phone_number"
                      type="text" 
                      defaultValue={user.phone_number}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.address}</label>
                    <input 
                      name="address"
                      type="text" 
                      defaultValue={user.address}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">{t.facility_addresses}</label>
                    <textarea 
                      name="facility_addresses"
                      defaultValue={user.facility_addresses}
                      rows={3}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="pt-4 border-t border-stone-100">
            <label className="block text-sm font-medium text-stone-700 mb-1">{t.new_password}</label>
            <input 
              name="password"
              type="password" 
              placeholder="••••••••"
              className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex justify-end pt-4">
            <button 
              type="submit"
              disabled={isSaving}
              className="bg-emerald-600 text-white px-8 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
            >
              {isSaving ? t.analyzing : t.update_profile}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TariffsView({ user, t }: { user: User, t: any }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const plans = [
    { id: 'BASIC', name: t.tariff_basic, months: 1, price: t.price_30, label: t.monthly },
    { id: 'PRO', name: t.tariff_pro, months: 6, price: t.price_150, label: t.semi_annual },
    { id: 'ENTERPRISE', name: t.tariff_enterprise, months: 12, price: t.price_240, label: t.annual },
  ];

  const handleSelectPlan = async (plan: string, months: number) => {
    if (!confirm(`Are you sure you want to select the ${plan} plan?`)) return;
    
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/companies/${user.company_id}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, months })
      });
      if (res.ok) {
        alert('Subscription updated! Please refresh to see changes.');
        window.location.reload();
      } else {
        alert('Failed to update subscription');
      }
    } catch (err) {
      alert('Failed to update subscription');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">{t.tariffs}</h1>
        <p className="text-stone-500 mt-1">{t.select_plan}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 flex flex-col">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-stone-900">{plan.name}</h3>
              <p className="text-stone-500 text-sm">{plan.label}</p>
            </div>
            <div className="text-4xl font-bold text-emerald-600 mb-8">
              {plan.price}
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-2 text-stone-600">
                <Check size={18} className="text-emerald-500" />
                Full HACCP Access
              </li>
              <li className="flex items-center gap-2 text-stone-600">
                <Check size={18} className="text-emerald-500" />
                Unlimited Journals
              </li>
              <li className="flex items-center gap-2 text-stone-600">
                <Check size={18} className="text-emerald-500" />
                AI Risk Analysis
              </li>
            </ul>
            <button 
              onClick={() => handleSelectPlan(plan.id, plan.months)}
              disabled={isUpdating}
              className="w-full py-3 px-6 rounded-xl font-bold transition-all bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {t.get_started}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatView({ user, t, messages: initialMessages, socket }: { user: User, t: any, messages: any[], socket: WebSocket | null }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/messages')
      .then(res => res.json())
      .then(data => {
        setMessages(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (initialMessages.length > 0) {
      const lastMsg = initialMessages[initialMessages.length - 1];
      setMessages(prev => {
        if (prev.find(m => m.id === lastMsg.id)) return prev;
        return [...prev, lastMsg];
      });
    }
  }, [initialMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;

    const msg = {
      content: input,
      companyId: user.company_id,
      receiverId: user.role === 'SUPER_ADMIN' ? undefined : null // To super admin
    };

    socket.send(JSON.stringify(msg));
    
    // Optimistic update
    const optimisticMsg = {
      id: Date.now(),
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      content: input,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setInput('');
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-lg">
            <MessageSquare size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-stone-900">{t.chat}</h2>
            <p className="text-xs text-stone-500">Support & Communication</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50/30">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-stone-400">No messages yet. Start a conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={cn(
                "flex flex-col max-w-[80%]",
                msg.sender_id === user.id ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{msg.sender_name}</span>
                <span className="text-[10px] text-stone-300">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div 
                className={cn(
                  "px-4 py-2 rounded-2xl text-sm shadow-sm",
                  msg.sender_id === user.id 
                    ? "bg-emerald-600 text-white rounded-tr-none" 
                    : "bg-white border border-stone-200 text-stone-700 rounded-tl-none"
                )}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t border-stone-100 flex gap-2">
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        />
        <button 
          type="submit"
          className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20"
        >
          <Plus size={24} />
        </button>
      </form>
    </div>
  );
}

function PaymentsView({ t }: { t: any }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.payments.list().then(data => {
      setPayments(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">{t.payment_history}</h2>
        <p className="text-stone-500">View and track your subscription payments.</p>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{t.date}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{t.plan}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{t.duration}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{t.amount}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{t.method}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{t.status}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-stone-400 italic">
                  No payments found.
                </td>
              </tr>
            ) : (
              payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-stone-100 text-stone-700 text-[10px] font-bold rounded uppercase tracking-wider">
                      {p.tariff_plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {p.duration_months} {t.months_count}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-stone-900">
                    {p.amount} {p.currency}
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {p.payment_method}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase tracking-wider">
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

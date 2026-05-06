import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign } from 'lucide-react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';

interface TransactionModalProps {
  treeId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction?: any; // Optional transaction for editing
}

export default function TransactionModal({ treeId, isOpen, onClose, onSuccess, transaction }: TransactionModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'CLP',
    type: 'EXPENSE',
    category: 'OTHER',
    description: '',
    verificationStatus: 'DECLARED',
    date: new Date().toISOString().split('T')[0],
    isRecurring: false,
    isPeriodic: false,
    periodicity: 'BEGINNING_OF_MONTH' as any,
    daysCount: 30,
    isFixed: false,
    templateId: null as string | null
  });

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      if (transaction) {
        const tpl = transaction.template;
        setFormData({
          amount: (transaction.amount || 0).toString(),
          currency: transaction.currency || 'CLP',
          type: transaction.type || 'EXPENSE',
          category: transaction.category || 'OTHER',
          description: transaction.description || '',
          verificationStatus: transaction.verificationStatus || 'DECLARED',
          date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          isRecurring: !!transaction.templateId,
          isPeriodic: tpl?.isPeriodic || false,
          periodicity: tpl?.periodicity || 'BEGINNING_OF_MONTH',
          daysCount: tpl?.daysCount || 30,
          isFixed: tpl?.isFixed || false,
          templateId: transaction.templateId || null
        });
      } else {
        setFormData({
          amount: '',
          currency: 'CLP',
          type: 'EXPENSE',
          category: 'OTHER',
          description: '',
          verificationStatus: 'DECLARED',
          date: new Date().toISOString().split('T')[0],
          isRecurring: false,
          isPeriodic: false,
          periodicity: 'BEGINNING_OF_MONTH',
          daysCount: 30,
          isFixed: false,
          templateId: null
        });
      }
    }
  }, [isOpen, transaction]);

  const fetchTemplates = async () => {
    try {
      const response = await api.get(`/fiat/templates/${treeId}`);
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const isTemplateDue = (template: any) => {
    if (!template.isPeriodic || !template.lastUsedAt) return true;
    
    const lastUsed = new Date(template.lastUsedAt);
    const today = new Date();
    
    switch (template.periodicity) {
      case 'BEGINNING_OF_YEAR':
        return today.getFullYear() > lastUsed.getFullYear();
      case 'BEGINNING_OF_MONTH':
        return today.getMonth() > lastUsed.getMonth() || today.getFullYear() > lastUsed.getFullYear();
      case 'BEGINNING_OF_WEEK':
        // Simple week check (7 days)
        return (today.getTime() - lastUsed.getTime()) / (1000 * 3600 * 24) >= 7;
      case 'CUSTOM_DAYS':
        return (today.getTime() - lastUsed.getTime()) / (1000 * 3600 * 24) >= (template.daysCount || 1);
      default:
        return true;
    }
  };

  const dueTemplates = templates.filter(isTemplateDue);

  const applyTemplate = (tpl: any) => {
    setFormData({
      ...formData,
      amount: tpl.isFixed ? (tpl.amount || 0).toString() : formData.amount,
      type: tpl.type,
      category: tpl.category,
      description: tpl.description || '',
      isRecurring: true,
      isPeriodic: tpl.isPeriodic,
      periodicity: tpl.periodicity,
      daysCount: tpl.daysCount || 30,
      isFixed: tpl.isFixed,
      templateId: tpl.id
    });
  };

  const categories = [
    'WATER', 'ELECTRICITY', 'GAS', 'MORTGAGE', 'FUEL', 
    'SHOPPING', 'EQUIPMENT', 'MATERIAL', 'MONEY', 'OTHER'
  ];

  const verificationStatuses = ['DECLARED', 'BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (transaction) {
        await api.patch(`/fiat-transactions/${transaction.id}`, {
          ...formData,
          amount: parseFloat(formData.amount)
        });
      } else {
        await api.post(`/trees/${treeId}/fiat-ledger/transactions`, {
          ...formData,
          amount: parseFloat(formData.amount)
        });
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to handle transaction:', error);
      const msg = error.response?.data?.error || t('finance.error');
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-panel"
            style={{ width: '100%', maxWidth: '500px', position: 'relative' }}
          >
            <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <DollarSign className="text-gradient" /> {transaction ? t('finance.edit_title', 'Editar movimiento externo') : t('finance.modal_title', 'Registrar movimiento externo')}
            </h2>
            <p style={{ marginTop: '-0.75rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.4 }}>
              El fiat se registra como ledger externo. No otorga XP, nivel, votos ni autoridad dentro del Tree.
            </p>

            {dueTemplates.length > 0 && !transaction && (
              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>{t('finance.select_template', 'Usar Plantilla (Opcional)')}</label>
                <select 
                  className="input-field"
                  onChange={e => {
                    const tpl = dueTemplates.find(t => t.id === e.target.value);
                    if (tpl) applyTemplate(tpl);
                  }}
                  value=""
                >
                  <option value="" disabled>{t('finance.no_template_selected', 'Seleccionar una plantilla...')}</option>
                  {dueTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.description || t(`finance.categories.${tpl.category}`)} ({t(`finance.${tpl.type.toLowerCase()}`)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="flex-col" style={{ gap: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label>{t('finance.type')}</label>
                  <select 
                    className="input-field" 
                    value={formData.type} 
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                  >
                    <option value="INCOME">{t('finance.income')}</option>
                    <option value="EXPENSE">{t('finance.expense')}</option>
                    <option value="INVESTMENT">{t('finance.investment')}</option>
                  </select>
                </div>
                
                <div className="input-group" style={{ flex: 1 }}>
                  <label>{t('finance.amount')}</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={formData.amount} 
                    onChange={e => setFormData({ ...formData, amount: e.target.value })} 
                    placeholder="20000"
                    required 
                    readOnly={formData.isFixed}
                    style={formData.isFixed ? { opacity: 0.7, background: 'rgba(0,0,0,0.1)' } : {}}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label>Moneda</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase().slice(0, 3) })}
                    placeholder="CLP"
                    maxLength={3}
                  />
                </div>

                <div className="input-group" style={{ flex: 1 }}>
                  <label>Verificacion</label>
                  <select
                    className="input-field"
                    value={formData.verificationStatus}
                    onChange={e => setFormData({ ...formData, verificationStatus: e.target.value })}
                  >
                    {verificationStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label>{t('finance.category')}</label>
                <select 
                  className="input-field" 
                  value={formData.category} 
                  onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {t(`finance.categories.${cat}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>{t('finance.description')}</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={formData.description} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })} 
                  placeholder={t('finance.desc_placeholder')}
                />
              </div>

              <div className="input-group">
                <label>{t('finance.date')}</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={formData.date} 
                  onChange={e => setFormData({ ...formData, date: e.target.value })} 
                />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
                <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={formData.isRecurring}
                    onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })}
                  />
                  <span>{t('finance.recurring', 'Recurrente')}</span>
                </label>

                {formData.isRecurring && (
                  <>
                    <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={formData.isPeriodic}
                        onChange={e => setFormData({ ...formData, isPeriodic: e.target.checked })}
                      />
                      <span>{t('finance.periodic', 'Periódico')}</span>
                    </label>

                    <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={formData.isFixed}
                        onChange={e => setFormData({ ...formData, isFixed: e.target.checked })}
                      />
                      <span>{t('finance.fixed', 'Monto Fijo')}</span>
                    </label>
                  </>
                )}
              </div>

              {formData.isRecurring && formData.isPeriodic && (
                <div className="input-group animate-fade-in">
                  <label>{t('finance.periodicity', 'Periodicidad')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select 
                      className="input-field" 
                      style={{ flex: 1 }}
                      value={formData.periodicity} 
                      onChange={e => setFormData({ ...formData, periodicity: e.target.value as any })}
                    >
                      <option value="BEGINNING_OF_YEAR">{t('finance.period.year', 'Principio de año')}</option>
                      <option value="BEGINNING_OF_MONTH">{t('finance.period.month', 'Principio de mes')}</option>
                      <option value="BEGINNING_OF_WEEK">{t('finance.period.week', 'Principio de semana')}</option>
                      <option value="CUSTOM_DAYS">{t('finance.period.custom', 'Cada X días')}</option>
                    </select>
                    {formData.periodicity === 'CUSTOM_DAYS' && (
                      <input 
                        type="number" 
                        className="input-field" 
                        style={{ width: '80px' }}
                        value={formData.daysCount} 
                        onChange={e => setFormData({ ...formData, daysCount: parseInt(e.target.value) || 1 })}
                      />
                    )}
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: '0.5rem' }}>
                {loading ? t('finance.processing') : (transaction ? t('finance.save') : t('finance.submit'))}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { sendClientInvoice, sendClientReport } from '../../lib/emailService';
import { compressImage } from '../../lib/imageCompression';
import Badge from '../../components/common/Badge';

export default function IpmAuditForm({ profile, initialData, onComplete }) {
  const [step, setStep] = useState(1);
  const [inspectionId, setInspectionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [feeSchedule, setFeeSchedule] = useState({});

  const [formData, setFormData] = useState({
    client_id: null,
    inspector_name: profile?.full_name || '',
    inspection_date: new Date().toISOString().slice(0, 16),
    people_on_ground: [],
    form_type: 'ipm_audit',
    ipm_data: {
      compliance: {
        licensed_operator: null,
        pcpb_license: null,
        service_reports: null,
        sds_available: null,
        sightings_logbook: null,
        staff_safety: null,
        ppe_usage: null,
        chemical_storage: null,
        routine_monitoring: null,
        infestation_observed: null,
        infestation_details: '',
        corrective_actions: null,
      },
      monitoring_devices: {
        rodent_bait_stations: 0,
        fly_catchers: 0,
        cockroach_traps: 0,
        other_devices: 0,
      },
      sanitation: {
        cleanliness: 'Good',
        waste_management: 'Good',
        lighting_ventilation: 'Good',
        structural_integrity: 'Good',
        vegetation_management: 'Good',
      },
      summary: {
        status: 'Compliant', // Compliant, Partially Compliant, Non-Compliant
        responsible_person: '',
        responsible_person_phone: '',
        timeline: '',
      }
    },
    recommendations: [],
    notes: '',
    media: [],
    photo_urls: [],
    photo_meta: [],
    fee_category: '',
    fee_premise: '',
    calculated_fee: 0,
    ipm_audit: 0,
    ipm_nccg: 0,
    ipm_vendor: 0,
    is_paid: false,
    payment_method: 'Cash',
    amount_paid: '',
    payment_ref: '',
    payment_status: 'pending'
  });

  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [searchError, setSearchError] = useState('');
  const [newPerson, setNewPerson] = useState({ name: '', phone: '', company: '' });

  useEffect(() => {
    const fetchFees = async () => {
      try {
        const res = await apiFetch('/inspections/settings/finance_act_2023/');
        setFeeSchedule(res.value || {});
      } catch (error) {
        console.error("Failed to fetch fee schedule:", error);
      }
    };
    fetchFees();
  }, []);

  useEffect(() => {
    if (search.length < 3) {
      setClients([]);
      setSearchError('');
      return;
    }
    const delay = setTimeout(async () => {
      try {
        setSearchError('');
        const res = await apiFetch(`/inspections/businesses/?search=${encodeURIComponent(search)}&limit=5&applied_by_me=true`);
        const data = res.results || res;
        setClients(Array.isArray(data) ? data : []);
      } catch (err) {
        setClients([]);
        setSearchError('Could not reach server.');
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    if (initialData) {
      setInspectionId(initialData.id);
      setFormData(prev => ({
        ...prev,
        ...initialData,
        client_id: initialData.business_id || initialData.business,
        _clientObj: initialData.businesses || initialData.business,
        ipm_data: initialData.ipm_data || prev.ipm_data
      }));
      setStep(2); // Jump to step 2 if we have a draft
    }
  }, [initialData]);

  const selectClient = (client) => {
    setFormData(prev => ({ ...prev, client_id: client.id, _clientObj: client }));
    setSearch('');
    setClients([]);
    setStep(2);
  };

  const handleComplianceChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ipm_data: {
        ...prev.ipm_data,
        compliance: { ...prev.ipm_data.compliance, [field]: value }
      }
    }));
  };

  const handleMonitoringChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ipm_data: {
        ...prev.ipm_data,
        monitoring_devices: { ...prev.ipm_data.monitoring_devices, [field]: parseInt(value) || 0 }
      }
    }));
  };

  const handleSanitationChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ipm_data: {
        ...prev.ipm_data,
        sanitation: { ...prev.ipm_data.sanitation, [field]: value }
      }
    }));
  };

  const handleSummaryChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ipm_data: {
        ...prev.ipm_data,
        summary: { ...prev.ipm_data.summary, [field]: value }
      }
    }));
  };

  const submitReport = async (actionPhase) => {
    if (!formData.client_id) {
      alert("Error: No business selected.");
      setStep(1);
      return;
    }
    const isDraft = actionPhase === 'draft';
    try {
      setLoading(true);
      const photoUrls = [];
      const photoMeta = [];

      if (formData.media && formData.media.length > 0) {
        for (const m of formData.media) {
          const uploadData = new FormData();
          uploadData.append('file', m.file);
          const publicData = await apiFetch('/inspections/upload/', { method: 'POST', body: uploadData });
          photoUrls.push(publicData.publicUrl);
          photoMeta.push({ url: publicData.publicUrl, name: m.file.name, caption: m.caption });
        }
      }

      const payload = {
        business_id: formData.client_id,
        inspector_id: profile.id,
        inspector_name: formData.inspector_name,
        inspection_date: formData.inspection_date,
        people_on_ground: formData.people_on_ground,
        form_type: 'ipm_audit',
        ipm_data: formData.ipm_data,
        recommendations: formData.recommendations,
        photo_urls: inspectionId ? [...(formData.photo_urls || []), ...photoUrls] : photoUrls,
        photo_meta: inspectionId ? [...(formData.photo_meta || []), ...photoMeta] : photoMeta,
        notes: formData.notes,
        status: isDraft ? 'draft' : 'completed',
        is_draft: isDraft,
        approval_status: isDraft ? 'draft' : 'pending',
        fee_category: formData.fee_category,
        fee_premise: formData.fee_premise,
        calculated_fee: formData.calculated_fee,
        is_paid: formData.is_paid,
        amount_paid: formData.amount_paid ? parseFloat(formData.amount_paid) : 0,
        payment_ref: formData.payment_ref,
        payment_method: formData.payment_method,
        payment_status: formData.is_paid ? 'audit_pending' : 'pending',
        ipm_audit: formData.ipm_audit || 0,
        ipm_nccg: formData.ipm_nccg || 0,
        ipm_vendor: formData.ipm_vendor || 0
      };

      const method = inspectionId ? 'PATCH' : 'POST';
      const endpoint = inspectionId ? `/inspections/inspections/${inspectionId}/` : '/inspections/inspections/';
      const resultObj = await apiFetch(endpoint, { method, body: JSON.stringify(payload) });
      const createdId = resultObj.id;

      if (actionPhase === 'step6') {
        const fullRecord = await apiFetch(`/inspections/inspections/${createdId}/`);
        if (fullRecord) {
          await sendClientReport(fullRecord);
          alert(`IPM Audit Report submitted!`);
        }
        setInspectionId(createdId);
        setStep(6); // Finance step
        return;
      }

      if (actionPhase === 'draft') {
        setInspectionId(createdId);
        alert("Progress saved as draft.");
        return;
      }

      if (onComplete) onComplete();
    } catch (e) {
      console.error(e);
      alert("Submission failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl max-w-2xl mx-auto mb-10 text-white">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-emerald-400">IPM Audit Form</h2>
        <Badge type="emerald">Step {step} of 6</Badge>
      </div>

      {loading && <div className="mb-4 text-emerald-300 animate-pulse font-bold">Processing Audit...</div>}

      {/* Step 1: Client Selection */}
      {step === 1 && (
        <div className="space-y-4 fade-in">
          <h3 className="text-lg font-bold">1. Select Business for Audit</h3>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-white focus:ring-2 focus:ring-emerald-500"
            placeholder="Search Business Name or Permit #..."
          />
          {searchError && (
            <p className="text-xs text-rose-400 font-bold bg-rose-400/10 p-2 rounded border border-rose-400/20">{searchError}</p>
          )}
          {clients.length > 0 && (
            <div className="bg-slate-900 border border-slate-600 rounded-lg overflow-hidden">
              {clients.map(c => (
                <div key={c.id} onClick={() => selectClient(c)} className="p-4 border-b border-slate-700 hover:bg-slate-800 cursor-pointer">
                  <p className="font-bold">{c.business_name}</p>
                  <p className="text-sm text-slate-400">{c.permit_no} • {c.ward_name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Compliance Assessment */}
      {step === 2 && (
        <div className="space-y-6 fade-in">
          <h3 className="text-lg font-bold">2. IPM Compliance Assessment</h3>
          <div className="bg-slate-900/50 p-4 rounded-lg mb-4 border border-slate-700">
             <p className="text-xs text-slate-400 uppercase font-bold">Target Client</p>
             <p className="text-emerald-400 font-black">{formData._clientObj?.business_name}</p>
          </div>

          <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg mb-4">
            <label className="block text-sm font-bold text-slate-400 mb-2">Participants</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input
                type="text"
                placeholder="Name"
                value={newPerson.name}
                onChange={e => setNewPerson({ ...newPerson, name: e.target.value })}
                className="bg-slate-800 border border-slate-600 rounded p-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={newPerson.phone}
                onChange={e => setNewPerson({ ...newPerson, phone: e.target.value })}
                className="bg-slate-800 border border-slate-600 rounded p-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Company"
                value={newPerson.company}
                onChange={e => setNewPerson({ ...newPerson, company: e.target.value })}
                className="bg-slate-800 border border-slate-600 rounded p-2 text-xs text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (newPerson.name) {
                  setFormData(prev => ({ ...prev, people_on_ground: [...prev.people_on_ground, newPerson] }));
                  setNewPerson({ name: '', phone: '', company: '' });
                }
              }}
              className="bg-emerald-600/20 text-emerald-400 border border-emerald-600 hover:bg-emerald-600 hover:text-white px-3 py-1 rounded text-xs font-bold transition-all"
            >
              + Add Person
            </button>
            {formData.people_on_ground && formData.people_on_ground.length > 0 && (
              <div className="mt-3 space-y-2">
                {formData.people_on_ground.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-800 p-2 rounded text-xs border border-slate-700">
                    <div>
                      <p className="font-bold text-white">{p.name}</p>
                      <p className="text-slate-400">{p.phone} • {p.company}</p>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, people_on_ground: prev.people_on_ground.filter((_, i) => i !== idx) }))}
                      className="text-rose-400 hover:text-rose-300 font-bold"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="grid gap-4">
            {[
              { id: 'licensed_operator', label: 'Licensed Pest Control Operator Available' },
              { id: 'pcpb_license', label: 'Valid PCPB License Available' },
              { id: 'service_reports', label: 'Pest Control Service Reports Available' },
              { id: 'sds_available', label: 'Chemical Safety Data Sheets (SDS) Available' },
              { id: 'sightings_logbook', label: 'Pest Sightings Logbook Available & Updated' },
              { id: 'staff_safety', label: 'Staff Safety Considerations in Place' },
              { id: 'ppe_usage', label: 'PPE Usage by Applicators' },
              { id: 'chemical_storage', label: 'Proper Chemical Storage & Labelling' },
              { id: 'routine_monitoring', label: 'Evidence of Routine Pest Monitoring' },
              { id: 'infestation_observed', label: 'Evidence of Pest Infestation Observed' },
              { id: 'corrective_actions', label: 'Corrective Actions from Previous Audit Implemented' },
            ].map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
                <span className="text-sm">{item.label}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleComplianceChange(item.id, true)}
                    className={`px-4 py-1 rounded-md text-xs font-bold transition ${formData.ipm_data.compliance[item.id] === true ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >Yes</button>
                  <button
                    onClick={() => handleComplianceChange(item.id, false)}
                    className={`px-4 py-1 rounded-md text-xs font-bold transition ${formData.ipm_data.compliance[item.id] === false ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >No</button>
                </div>
              </div>
            ))}

            {formData.ipm_data.compliance.infestation_observed && (
              <div className="space-y-2 fade-in">
                <label className="text-xs font-bold text-slate-400 uppercase">Specify Infestation Details</label>
                <textarea
                  value={formData.ipm_data.compliance.infestation_details}
                  onChange={e => handleComplianceChange('infestation_details', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
                  placeholder="What pests, where, and extent..."
                />
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={() => setStep(1)} className="flex-1 bg-slate-700 p-4 rounded-xl font-bold text-sm">Back</button>
            <button onClick={() => submitReport('draft')} className="flex-1 bg-slate-600/50 p-4 rounded-xl font-bold text-sm">Save Progress</button>
            <button onClick={() => setStep(3)} className="flex-1 bg-white text-slate-900 p-4 rounded-xl font-black text-sm">Next Step →</button>
          </div>
        </div>
      )}

      {/* Step 3: Devices & Sanitation */}
      {step === 3 && (
        <div className="space-y-6 fade-in">
          <h3 className="text-lg font-bold">3. Devices & Sanitation</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-emerald-400 border-b border-emerald-500/20 pb-2">Monitoring Devices</h4>
              {[
                { id: 'rodent_bait_stations', label: 'Rodent Stations' },
                { id: 'fly_catchers', label: 'Fly Catchers' },
                { id: 'cockroach_traps', label: 'Cockroach Traps' },
                { id: 'other_devices', label: 'Other Devices' },
              ].map(item => (
                <div key={item.id}>
                  <label className="text-xs text-slate-400">{item.label}</label>
                  <input
                    type="number"
                    value={formData.ipm_data.monitoring_devices[item.id]}
                    onChange={e => handleMonitoringChange(item.id, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm mt-1"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-emerald-400 border-b border-emerald-500/20 pb-2">Sanitation Rating</h4>
              {[
                { id: 'cleanliness', label: 'General Cleanliness' },
                { id: 'waste_management', label: 'Waste Management' },
                { id: 'lighting_ventilation', label: 'Light & Vent.' },
                { id: 'structural_integrity', label: 'Structural Integrity' },
                { id: 'vegetation_management', label: 'Vegetation' },
              ].map(item => (
                <div key={item.id}>
                  <label className="text-xs text-slate-400">{item.label}</label>
                  <select
                    value={formData.ipm_data.sanitation[item.id]}
                    onChange={e => handleSanitationChange(item.id, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm mt-1"
                  >
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={() => setStep(2)} className="flex-1 bg-slate-700 p-4 rounded-xl font-bold text-sm">Back</button>
            <button onClick={() => submitReport('draft')} className="flex-1 bg-slate-600/50 p-4 rounded-xl font-bold text-sm">Save Progress</button>
            <button onClick={() => setStep(4)} className="flex-1 bg-white text-slate-900 p-4 rounded-xl font-black text-sm">Next Step →</button>
          </div>
        </div>
      )}

      {/* Step 4: Other Observations */}
      {step === 4 && (
        <div className="space-y-6 fade-in">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400">📝</div>
             <div>
                <h3 className="text-lg font-bold">4. Other Observations</h3>
                <p className="text-xs text-slate-400">Capture findings not covered in the standard checklists.</p>
             </div>
          </div>
          
          <div className="space-y-4">
            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50">
               <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 block">New Findings / Field Notes</label>
               <textarea
                 value={formData.notes}
                 onChange={e => setFormData({ ...formData, notes: e.target.value })}
                 className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all text-emerald-50"
                 placeholder="Write here about unique site conditions, owner feedback, or any other manual entries..."
                 rows="10"
               />
            </div>
            
            <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
               <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">Tip</p>
               <p className="text-xs text-slate-400 italic">This content will be rendered in the 'Additional Notes' section of the official PDF report.</p>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={() => setStep(3)} className="flex-1 bg-slate-700 p-4 rounded-xl font-bold text-sm">Back</button>
            <button onClick={() => submitReport('draft')} className="flex-1 bg-slate-600/50 p-4 rounded-xl font-bold text-sm">Save Progress</button>
            <button onClick={() => setStep(5)} className="flex-1 bg-white text-slate-900 p-4 rounded-xl font-black text-sm uppercase tracking-widest">Next Step →</button>
          </div>
        </div>
      )}

      {/* Step 5: Summary & Media */}
      {step === 5 && (
        <div className="space-y-6 fade-in">
          <h3 className="text-lg font-bold">5. Summary & Media</h3>
          
          <div className="space-y-4">
             <label className="text-sm font-bold text-slate-400">Recommended Actions (Press Enter to add)</label>
             <input 
               type="text" 
               placeholder="Type and press Enter..."
               onKeyDown={e => {
                 if (e.key === 'Enter') {
                   e.preventDefault();
                   const val = e.target.value.trim();
                   if (val && !formData.recommendations.includes(val)) {
                     setFormData({ ...formData, recommendations: [...formData.recommendations, val] });
                     e.target.value = '';
                   }
                 }
               }}
               onBlur={e => {
                 const val = e.target.value.trim();
                 if (val && !formData.recommendations.includes(val)) {
                   setFormData({ ...formData, recommendations: [...formData.recommendations, val] });
                   e.target.value = '';
                 }
               }}
               className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
             />
             <div className="flex flex-wrap gap-2">
               {formData.recommendations.map(r => (
                 <span key={r} className="bg-emerald-900/40 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs flex items-center gap-2">
                   {r}
                   <button onClick={() => setFormData({...formData, recommendations: formData.recommendations.filter(i => i !== r)})}>&times;</button>
                 </span>
               ))}
             </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Compliance Status</label>
              <select
                value={formData.ipm_data.summary.status}
                onChange={e => handleSummaryChange('status', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
              >
                <option value="Compliant">Compliant</option>
                <option value="Partially Compliant">Partially Compliant</option>
                <option value="Non-Compliant">Non-Compliant</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Timeline for Improvements</label>
              <input
                type="text"
                value={formData.ipm_data.summary.timeline}
                onChange={e => handleSummaryChange('timeline', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
                placeholder="e.g. 14 Days"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Responsible Person</label>
              <input
                type="text"
                value={formData.ipm_data.summary.responsible_person}
                onChange={e => handleSummaryChange('responsible_person', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
                placeholder="Manager/Owner Name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Responsible Person Phone</label>
              <input
                type="text"
                value={formData.ipm_data.summary.responsible_person_phone || ''}
                onChange={e => handleSummaryChange('responsible_person_phone', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
                placeholder="e.g. 0700123456"
              />
            </div>
          </div>

          <div className="space-y-4">
             <label className="text-sm font-bold text-slate-400">Site Evidence (Photos)</label>
             {isCompressing && (
               <div className="flex items-center gap-2 text-emerald-400 animate-pulse">
                 <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                 <span className="text-xs font-bold uppercase tracking-wider">Optimizing evidence files...</span>
               </div>
             )}
             <div className="flex gap-4">
               <label className={`flex-1 bg-slate-900 border border-slate-600 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-800 transition ${isCompressing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                 <span className="text-2xl block mb-2">📸</span>
                 <span className="text-white text-sm font-bold block">Take Photo</span>
                 <span className="text-[10px] text-slate-400">Use camera</span>
                 <input 
                   type="file" 
                   accept="image/*"
                   capture="environment"
                   disabled={isCompressing}
                   className="hidden"
                   onChange={async e => {
                     if (!e.target.files.length) return;
                     setIsCompressing(true);
                     const files = Array.from(e.target.files);
                     const processed = [];
                     for (const f of files) {
                       const compressed = await compressImage(f);
                       processed.push({ file: compressed, caption: '' });
                     }
                     setFormData(prev => ({ ...prev, media: [...prev.media, ...processed] }));
                     setIsCompressing(false);
                     e.target.value = ''; // Reset
                   }}
                 />
               </label>
               <label className={`flex-1 bg-slate-900 border border-slate-600 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-800 transition ${isCompressing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                 <span className="text-2xl block mb-2">📁</span>
                 <span className="text-white text-sm font-bold block">Upload Files</span>
                 <span className="text-[10px] text-slate-400">Choose from gallery</span>
                 <input 
                   type="file" 
                   multiple 
                   accept="image/*"
                   disabled={isCompressing}
                   className="hidden"
                   onChange={async e => {
                     if (!e.target.files.length) return;
                     setIsCompressing(true);
                     const files = Array.from(e.target.files);
                     const processed = [];
                     for (const f of files) {
                       const compressed = await compressImage(f);
                       processed.push({ file: compressed, caption: '' });
                     }
                     setFormData(prev => ({ ...prev, media: [...prev.media, ...processed] }));
                     setIsCompressing(false);
                     e.target.value = ''; // Reset
                   }}
                 />
               </label>
             </div>
             <div className="flex gap-2 overflow-x-auto pb-2">
               {formData.media.map((m, idx) => (
                 <div key={idx} className="relative w-20 h-20 flex-shrink-0">
                   <img src={URL.createObjectURL(m.file)} className="w-full h-full object-cover rounded-lg border border-slate-600" alt="Preview"/>
                   <button onClick={() => setFormData({...formData, media: formData.media.filter((_, i) => i !== idx)})} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-5 h-5 text-[10px]">✕</button>
                 </div>
               ))}
             </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={() => setStep(4)} className="flex-1 bg-slate-700 p-4 rounded-xl font-bold text-sm">Back</button>
            <button onClick={() => submitReport('draft')} className="flex-1 bg-slate-600/50 p-4 rounded-xl font-bold text-sm">Save Progress</button>
            <button onClick={() => submitReport('step6')} className="flex-1 bg-emerald-600 text-white p-4 rounded-xl font-black shadow-lg shadow-emerald-900/20 text-sm">Finalize Audit →</button>
          </div>
        </div>
      )}

      {/* Step 6: Finance */}
      {step === 6 && (
        <div className="space-y-6 fade-in">
          <h3 className="text-lg font-bold">6. Finance & Billing</h3>
          
          <div className="space-y-4">
            <label className="text-sm font-bold text-slate-400">Premise Category</label>
            <select 
              value={formData.fee_category}
              onChange={e => setFormData({ ...formData, fee_category: e.target.value, fee_premise: '', calculated_fee: 0 })}
              className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
            >
              <option value="">-- Select --</option>
              {Object.keys(feeSchedule).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            {formData.fee_category && (
              <>
                <label className="text-sm font-bold text-slate-400">Premise Classification</label>
                <select 
                  value={formData.fee_premise}
                  onChange={e => {
                    const f = (feeSchedule[formData.fee_category] || []).find(f => f.premise === e.target.value);
                    const auditFee = f?.fees?.ipmAudit || 0;
                    setFormData({ 
                      ...formData, 
                      fee_premise: e.target.value, 
                      calculated_fee: f?.fees?.total || 0,
                      ipm_audit: auditFee,
                      ipm_nccg: auditFee * 0.25,
                      ipm_vendor: auditFee * 0.75
                    });
                  }}
                  className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm"
                >
                  <option value="">-- Select --</option>
                  {(feeSchedule[formData.fee_category] || []).map(p => <option key={p.premise} value={p.premise}>{p.premise}</option>)}
                </select>
              </>
            )}

            {formData.ipm_audit > 0 && (
              <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-500/30 p-5 rounded-2xl mt-4 shadow-inner">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Audit Fee</p>
                <p className="text-4xl font-black text-white">KES {Number(formData.ipm_audit || 0).toLocaleString()}</p>
                
                <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-emerald-500/20">
                   <div>
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Govt Share (25%)</p>
                     <p className="text-lg font-bold text-emerald-400/80">KES {Number(formData.ipm_nccg || 0).toLocaleString()}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Vendor Share (75%)</p>
                     <p className="text-lg font-bold text-blue-400/80">KES {Number(formData.ipm_vendor || 0).toLocaleString()}</p>
                   </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-700 mt-6">
               <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <input 
                    type="checkbox" 
                    checked={formData.is_paid} 
                    onChange={e => setFormData({ ...formData, is_paid: e.target.checked })} 
                    className="w-5 h-5 text-emerald-600 rounded"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-sm">Payment Received on Ground?</p>
                    <p className="text-[10px] text-slate-500 uppercase">Confirming payment now notifies Finance for Audit</p>
                  </div>
               </label>

               {formData.is_paid && (
                 <div className="mt-4 space-y-4 bg-slate-900 p-4 rounded-lg border border-slate-700 fade-in">
                    <div className="grid grid-cols-3 gap-2">
                       {['Cash', 'Mpesa', 'Cheque'].map(m => (
                         <button 
                           key={m}
                           type="button"
                           onClick={() => setFormData({ ...formData, payment_method: m })}
                           className={`p-3 rounded font-bold text-xs ${formData.payment_method === m ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                         >
                           {m}
                         </button>
                       ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount (KES)</label>
                          <input 
                            type="number" 
                            value={formData.amount_paid}
                            onChange={e => setFormData({ ...formData, amount_paid: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm"
                            placeholder="Amount..."
                          />
                       </div>
                       <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                             {formData.payment_method === 'Mpesa' ? 'Mpesa Code' : (formData.payment_method === 'Cheque' ? 'Cheque #' : 'Reference (Optional)')}
                          </label>
                          <input 
                            type="text" 
                            value={formData.payment_ref}
                            onChange={e => setFormData({ ...formData, payment_ref: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm font-mono"
                            placeholder="Ref..."
                          />
                       </div>
                    </div>
                 </div>
               )}
            </div>
          </div>

          <button 
            onClick={() => submitReport()} 
            disabled={loading}
            className="w-full bg-white text-slate-900 p-4 rounded-xl font-black disabled:opacity-50"
          >
            {loading ? 'Finalizing...' : 'Complete Audit & Submit to NCCG'}
          </button>
        </div>
      )}
    </div>
  );
}

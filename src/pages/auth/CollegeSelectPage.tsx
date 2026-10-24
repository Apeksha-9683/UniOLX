import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getColleges, requestNewCollege } from '../../api';
import { College } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import {
  Search,
  GraduationCap,
  ArrowRight,
  Check,
  Building2,
  MapPin,
  Sparkles,
  School,
  Mail,
  HelpCircle
} from 'lucide-react';
import {
  CampusDoodleBicycle,
  CampusDoodleBook,
  CampusDoodleChai
} from '../../components/ui/CampusDoodles';

export const CollegeSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedCollege, selectedCollege } = useAuth();
  const { showToast } = useToast();

  const [colleges, setColleges] = useState<College[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string>('rvce');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // College request form state
  const [reqCollegeName, setReqCollegeName] = useState('');
  const [reqCity, setReqCity] = useState('');
  const [reqDomain, setReqDomain] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  useEffect(() => {
    getColleges().then((data) => {
      setColleges(data);
      if (selectedCollege) {
        setSelectedId(selectedCollege.id);
      } else if (data.length > 0) {
        setSelectedId(data[0].id);
      }
    });
  }, [selectedCollege]);

  const filteredColleges = colleges.filter((c) => {
    const q = searchTerm.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      c.shortName.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      (c.domain && c.domain.toLowerCase().includes(q))
    );
  });

  const handleSelect = (college: College) => {
    setSelectedId(college.id);
    setSelectedCollege(college);
  };

  const handleContinue = () => {
    const chosen = colleges.find((c) => c.id === selectedId) || colleges[0];
    setSelectedCollege(chosen);
    navigate(`/register?college=${chosen.id}`);
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqCollegeName.trim() || !reqEmail.trim()) {
      showToast('Please provide the college name and your student email', 'error');
      return;
    }

    setIsSubmittingReq(true);
    const res = await requestNewCollege({
      collegeName: reqCollegeName,
      city: reqCity,
      domain: reqDomain,
      requesterEmail: reqEmail
    });
    setIsSubmittingReq(false);
    setIsRequestModalOpen(false);
    showToast(res.message, 'success');

    setReqCollegeName('');
    setReqCity('');
    setReqDomain('');
    setReqEmail('');
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 space-y-8">
      {/* Hero Headline with Campus Doodles */}
      <div className="text-center relative max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FFF3C4] border border-[#FFD966] text-[#8C6500] font-bold text-xs shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-[#FF7A1A]" />
          <span>Exclusive Indian University Marketplace</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-[#1F1A17] tracking-tight leading-tight">
          Your campus. Your marketplace.
        </h1>

        <p className="text-sm sm:text-base text-[#6B625A] leading-relaxed">
          Select your college to see second-hand books, cycles, calculators, and hostel essentials listed by verified students on your campus.
        </p>

        {/* Small inline playful doodles */}
        <div className="flex items-center justify-center gap-6 pt-1 text-[#FF7A1A]/40">
          <CampusDoodleBicycle className="w-6 h-6" />
          <CampusDoodleBook className="w-6 h-6 text-[#FFC72C]" />
          <CampusDoodleChai className="w-6 h-6 text-[#E5383B]/50" />
        </div>
      </div>

      {/* Large Search Box */}
      <div className="max-w-2xl mx-auto">
        <div className="relative shadow-md shadow-[#FFC72C]/15 rounded-3xl">
          <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-[#8C827A]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search your college by name, short code (e.g. RVCE, IITB), or city..."
            className="w-full pl-13 pr-5 py-4 bg-white border-2 border-[#EFE6D8] rounded-3xl text-sm sm:text-base font-medium text-[#1F1A17] placeholder-[#A4998E] focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/10 transition-all"
          />
        </div>
      </div>

      {/* Grid of College Cards */}
      {filteredColleges.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredColleges.map((college) => {
            const isSelected = selectedId === college.id;
            return (
              <div
                key={college.id}
                onClick={() => handleSelect(college)}
                className={`group relative p-5 rounded-3xl bg-white border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 text-left ${
                  isSelected
                    ? 'border-[#FF7A1A] bg-gradient-to-br from-white to-[#FFF9EE] shadow-lg shadow-[#FF7A1A]/15 scale-[1.01]'
                    : 'border-[#EFE6D8] hover:border-[#FFC72C] hover:shadow-md hover:shadow-[#FFC72C]/10'
                }`}
              >
                {/* Top: Initials badge & Tick */}
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm tracking-wide transition-colors ${
                      isSelected
                        ? 'bg-gradient-to-tr from-[#FF7A1A] to-[#FF9E2C] text-white shadow-xs'
                        : 'bg-[#FFF3C4] text-[#8C6500] group-hover:bg-[#FFE699]'
                    }`}
                  >
                    {college.shortName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}
                  </div>

                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-[#EFE6D8] group-hover:border-[#FFC72C]" />
                  )}
                </div>

                {/* Info */}
                <div>
                  <h3 className="font-extrabold text-base text-[#1F1A17] group-hover:text-[#FF7A1A] transition-colors leading-tight">
                    {college.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-[#6B625A] mt-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-[#FF7A1A] shrink-0" />
                    <span>
                      {college.city}, {college.state}
                    </span>
                  </div>
                </div>

                {/* Domain Pill */}
                <div className="pt-2 border-t border-[#F5ECE0] flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#8C6500] bg-[#FFF8EC] px-2.5 py-0.5 rounded-full border border-[#EFE6D8]">
                    {college.domain ? `@${college.domain}` : 'Institutional'}
                  </span>
                  <span className="text-[11px] text-[#A4998E] font-medium">
                    {college.campusSpots?.length || 0} pickup spots
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* No college found state */
        <div className="bg-white rounded-3xl p-8 sm:p-12 border-2 border-dashed border-[#EFE6D8] text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-[#FFF3C4] text-[#FF7A1A] flex items-center justify-center mx-auto">
            <School className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-[#1F1A17]">No college found</h3>
            <p className="text-xs sm:text-sm text-[#6B625A]">
              We couldn't find a campus matching "{searchTerm}". Is your college missing from the list?
            </p>
          </div>
          <Button
            variant="yellow"
            size="md"
            icon={<Building2 className="w-4 h-4 text-[#FF7A1A]" />}
            onClick={() => setIsRequestModalOpen(true)}
          >
            Request Your College
          </Button>
        </div>
      )}

      {/* Sticky Bottom Action Bar with Continue Button */}
      <div className="bg-white/90 backdrop-blur-md p-4 sm:p-5 rounded-3xl border-2 border-[#EFE6D8] shadow-lg shadow-[#FFC72C]/10 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] text-[#8C6500] flex items-center justify-center shrink-0 font-bold text-xs">
            {colleges.find((c) => c.id === selectedId)?.shortName.slice(0, 3) || 'COL'}
          </div>
          <div>
            <div className="text-xs text-[#6B625A]">Selected College:</div>
            <div className="text-sm font-bold text-[#1F1A17]">
              {colleges.find((c) => c.id === selectedId)?.name || 'RV College of Engineering'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="text-xs font-bold text-[#6B625A] hover:text-[#FF7A1A] underline px-2 cursor-pointer"
          >
            College missing?
          </button>
          <Button
            variant="primary"
            size="lg"
            fullWidth={false}
            className="flex-1 sm:flex-none min-w-[200px]"
            onClick={handleContinue}
            icon={<ArrowRight className="w-5 h-5" />}
          >
            Continue to Register
          </Button>
        </div>
      </div>

      {/* Modal: Request a New College */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Request Your College"
        subtitle="Help us bring Campus Mart to your university campus"
      >
        <form onSubmit={handleRequestSubmit} className="space-y-4 py-2">
          <Input
            label="College / University Name"
            placeholder="e.g. National Institute of Technology Calicut"
            value={reqCollegeName}
            onChange={(e) => setReqCollegeName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="City"
              placeholder="e.g. Kozhikode"
              value={reqCity}
              onChange={(e) => setReqCity(e.target.value)}
              required
            />
            <Input
              label="Campus Domain"
              placeholder="e.g. nitc.ac.in"
              value={reqDomain}
              onChange={(e) => setReqDomain(e.target.value)}
              required
            />
          </div>

          <Input
            label="Your Student Email"
            type="email"
            placeholder="e.g. yourname@nitc.ac.in"
            icon={<Mail className="w-4 h-4" />}
            value={reqEmail}
            onChange={(e) => setReqEmail(e.target.value)}
            helperText="We will notify you the moment your college network is activated"
            required
          />

          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => setIsRequestModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isSubmittingReq}
            >
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

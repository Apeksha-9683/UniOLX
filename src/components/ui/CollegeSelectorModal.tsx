import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { College } from '../../types';
import { getColleges } from '../../api';
import { Search, GraduationCap, MapPin, Check } from 'lucide-react';

export interface CollegeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCollegeId: string;
  onSelectCollege: (college: College) => void;
}

export const CollegeSelectorModal: React.FC<CollegeSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedCollegeId,
  onSelectCollege
}) => {
  const [colleges, setColleges] = useState<College[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    getColleges().then(setColleges);
  }, []);

  const filteredColleges = colleges.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.shortName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Your College"
      subtitle="Campus Mart is exclusive to verified campus communities"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Search Filter */}
        <div className="relative flex items-center rounded-2xl bg-white border border-[#E8DFD3] transition-all duration-200 focus-within:border-[#FF7A1A] focus-within:ring-4 focus-within:ring-[#FF7A1A]/[0.18]">
          <Search className="w-4 h-4 ml-3.5 text-[#6B625A] shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by college name, short code or city..."
            className="w-full pl-2.5 pr-4 py-2.5 bg-transparent border-0 shadow-none rounded-2xl text-sm text-[#1F1A17] placeholder-[#A4998E] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
          />
        </div>

        {/* List of Colleges */}
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {filteredColleges.map((college) => {
            const isSelected = college.id.toLowerCase() === selectedCollegeId.toLowerCase();
            return (
              <button
                key={college.id}
                type="button"
                onClick={() => {
                  onSelectCollege(college);
                  onClose();
                }}
                className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-[#FFF3D6] border-[#FFC72C] shadow-sm'
                    : 'bg-white border-[#EFE6D8] hover:border-[#FFC72C] hover:bg-[#FFFDF9]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-[#FF7A1A] text-white shadow-xs'
                        : 'bg-[#FFF3C4] text-[#8C6500]'
                    }`}
                  >
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1F1A17] truncate">
                        {college.shortName}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F5ECE0] text-[#6B625A] font-medium shrink-0">
                        @{college.domain}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B625A] truncate mt-0.5">{college.name}</p>
                    <div className="flex items-center gap-1 text-[11px] text-[#A4998E] mt-1">
                      <MapPin className="w-3 h-3 text-[#FF7A1A]" />
                      <span>{college.city}, {college.state}</span>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center shrink-0 shadow-xs ml-2">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })}

          {filteredColleges.length === 0 && (
            <p className="text-center text-sm text-[#6B625A] py-8">
              No matching colleges found. We are expanding to more campuses soon!
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

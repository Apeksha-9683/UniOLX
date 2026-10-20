import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createListing, getColleges } from '../api';
import { ListingCategory, ListingCondition, College, Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ProductCard } from '../components/ui/ProductCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  UploadCloud,
  X,
  Plus,
  Minus,
  Sparkles,
  ShieldCheck,
  MapPin,
  Trash2,
  Save,
  CheckCircle2,
  HelpCircle,
  Tag,
  AlertCircle
} from 'lucide-react';

const DRAFT_STORAGE_KEY = 'campus_mart_sell_draft';

export const SellPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, selectedCollege } = useAuth();
  const { showToast } = useToast();

  const [colleges, setColleges] = useState<College[]>([]);
  const [activeCollege, setActiveCollege] = useState<College | null>(selectedCollege);

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ListingCategory>('Textbooks');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [originalPrice, setOriginalPrice] = useState<number | ''>('');
  const [condition, setCondition] = useState<ListingCondition>('Like New');
  const [quantity, setQuantity] = useState(1);
  const [pickupSpot, setPickupSpot] = useState('Cauvery Hostel Gate 2');
  const [customSpot, setCustomSpot] = useState('');

  // Photos (up to 5)
  const defaultPhoto = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80';
  const [photos, setPhotos] = useState<string[]>([defaultPhoto]);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Specifications key-value pairs
  const [specs, setSpecs] = useState<Array<{ key: string; val: string }>>([
    { key: 'Author / Brand', val: 'Khanna Publishers' },
    { key: 'Edition / Model', val: 'Latest VTU Revised' }
  ]);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getColleges().then((all) => {
      setColleges(all);
      const match = all.find((c) => c.id === user?.collegeId) || all[0];
      setActiveCollege(match);
      if (match?.campusSpots && match.campusSpots.length > 0) {
        setPickupSpot(match.campusSpots[0]);
      }
    });

    // Check saved draft
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.price) setPrice(parsed.price);
        if (parsed.originalPrice) setOriginalPrice(parsed.originalPrice);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.condition) setCondition(parsed.condition);
        if (parsed.photos?.length) setPhotos(parsed.photos);
        if (parsed.specs?.length) setSpecs(parsed.specs);
      }
    } catch {
      // ignore
    }
  }, [user]);

  const campusSpots = activeCollege?.campusSpots || [
    'Cauvery Hostel Gate 2',
    'Near Food Court & Canteen',
    'Mechanical Dept Portico',
    'Central Library Lawns',
    'Main Gate / Mysore Road Arch'
  ];

  // Photo handlers
  const handleAddPhotoUrl = () => {
    if (!newPhotoUrl.trim()) return;
    if (photos.length >= 5) {
      showToast('Maximum 5 photos allowed per listing', 'error');
      return;
    }
    setPhotos([...photos, newPhotoUrl.trim()]);
    setNewPhotoUrl('');
    showToast('Photo added!', 'info');
  };

  const handleRemovePhoto = (index: number) => {
    if (photos.length <= 1) {
      showToast('At least 1 photo is required', 'error');
      return;
    }
    setPhotos(photos.filter((_, idx) => idx !== index));
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (photos.length >= 5) {
      showToast('Maximum 5 photos allowed', 'error');
      return;
    }

    // Realistic simulation of uploaded student item images
    const samplePool = [
      'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1582533561751-ef6f6ab93a2e?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80'
    ];
    const picked = samplePool[photos.length % samplePool.length];
    setPhotos([...photos, picked]);
    showToast('Photo uploaded from device!', 'success');
  };

  // Specs handlers
  const handleAddSpecRow = () => {
    setSpecs([...specs, { key: '', val: '' }]);
  };

  const handleUpdateSpec = (idx: number, field: 'key' | 'val', value: string) => {
    const next = [...specs];
    next[idx][field] = value;
    setSpecs(next);
  };

  const handleRemoveSpec = (idx: number) => {
    setSpecs(specs.filter((_, i) => i !== idx));
  };

  // Validate form
  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!title.trim()) {
      errs.title = 'Please enter a title for your item.';
    } else if (title.trim().length < 5) {
      errs.title = 'Title should be at least 5 characters long.';
    }

    if (!price || Number(price) <= 0) {
      errs.price = 'Please specify a valid price in ₹.';
    }

    if (!description.trim()) {
      errs.description = 'Please describe the condition and usage for peers.';
    } else if (description.trim().length < 15) {
      errs.description = 'Description should be at least 15 characters.';
    }

    if (photos.length === 0) {
      errs.photos = 'Please provide at least 1 photo.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Save Draft
  const handleSaveDraft = () => {
    const draftData = {
      title,
      description,
      price,
      originalPrice,
      category,
      condition,
      photos,
      specs
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      showToast('Listing draft saved to this device!', 'success');
    } catch {
      showToast('Could not save draft', 'error');
    }
  };

  // Publish Listing
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalSpot = customSpot.trim() ? customSpot.trim() : pickupSpot;

      const specsRecord: Record<string, string> = {};
      specs.forEach((s) => {
        if (s.key.trim() && s.val.trim()) {
          specsRecord[s.key.trim()] = s.val.trim();
        }
      });

      const newListing = await createListing({
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        originalPrice: Number(originalPrice) || Number(price),
        category,
        condition,
        campusPickupSpot: finalSpot,
        images: photos,
        specs: specsRecord,
        quantity
      });

      localStorage.removeItem(DRAFT_STORAGE_KEY);
      showToast('Your item is live on campus! Redirecting to listing...', 'success');
      navigate(`/listing/${newListing.id}`);
    } catch {
      showToast('Error publishing listing', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create mock listing object for live preview
  const previewListing: Listing = {
    id: 'preview_id',
    title: title || 'Casio fx-991CW Scientific Calculator (ClassWiz Edition)',
    description: description || 'Used for Engineering Mathematics. Mint condition with case.',
    price: Number(price) || 950,
    originalPrice: Number(originalPrice) || 1595,
    category,
    condition,
    status: 'Available',
    collegeId: activeCollege?.id || 'rvce',
    collegeName: activeCollege?.name || 'RV College of Engineering',
    campusPickupSpot: customSpot.trim() || pickupSpot,
    seller: {
      id: user?.id || 'usr_preview',
      name: user?.name || 'Aarav Sharma',
      collegeId: activeCollege?.id || 'rvce',
      collegeName: activeCollege?.shortName || 'RVCE',
      branch: user?.branch || 'CSE 6th Sem',
      avatar: user?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Aarav&backgroundColor=ffc72c',
      isVerified: true,
      rating: 4.9,
      totalReviews: 18,
      hostelOrArea: user?.hostel || 'Cauvery Hostel'
    },
    images: photos,
    specs: {},
    tags: [category.toLowerCase()],
    postedAt: 'Just now',
    quantity
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Title Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DEF7EC] text-[#03543F] font-bold text-xs mb-1 border border-[#84E1BC]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0E9F6E]" />
            <span>Campus Seller Mode ({activeCollege?.shortName || 'RVCE'})</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1F1A17] tracking-tight">
            Sell to College Students
          </h1>
          <p className="text-xs sm:text-sm text-[#6B625A] mt-1">
            Publish your second-hand gear for in-person PIN-confirmed trade on campus
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={handleSaveDraft}>
            Save Draft
          </Button>
        </div>
      </div>

      {/* 2-Column Split: Form on Left, Live ProductCard Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Guided Form */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-sm space-y-6">
          <form onSubmit={handlePublish} className="space-y-6">
            {/* 1. Photo Upload (Drag & Drop, Max 5) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A]">
                  Photos ({photos.length}/5)
                </label>
                <span className="text-[11px] text-[#8C827A]">First photo will be card cover</span>
              </div>

              {/* Drag and drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`p-6 rounded-2xl border-2 border-dashed text-center transition-all ${
                  isDragging
                    ? 'border-[#FF7A1A] bg-[#FFF3C4]/30 scale-[1.01]'
                    : 'border-[#EFE6D8] bg-[#FFFDF9] hover:border-[#FFC72C]'
                }`}
              >
                <UploadCloud className="w-8 h-8 text-[#FF7A1A] mx-auto mb-2" />
                <p className="text-xs font-bold text-[#1F1A17]">
                  Drag and drop item photos here, or click to browse
                </p>
                <p className="text-[11px] text-[#6B625A] mt-0.5">
                  JPEG, PNG, WebP up to 5MB (Max 5 photos)
                </p>

                {/* Photo URL option */}
                <div className="mt-3 flex gap-2 max-w-md mx-auto">
                  <input
                    type="text"
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    placeholder="Or paste image URL (e.g. Unsplash)..."
                    className="flex-1 px-3 py-1.5 bg-white border border-[#EFE6D8] rounded-xl text-xs text-[#1F1A17] outline-none focus:border-[#FF7A1A]"
                  />
                  <Button type="button" variant="yellow" size="sm" onClick={handleAddPhotoUrl}>
                    Add Photo
                  </Button>
                </div>
              </div>

              {errors.photos && (
                <p className="text-xs text-[#E5383B] font-semibold">{errors.photos}</p>
              )}

              {/* Thumbnails strip */}
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {photos.map((url, idx) => (
                  <div key={idx} className="relative w-18 h-18 rounded-xl overflow-hidden border border-[#EFE6D8] group shrink-0">
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-[#E5383B] text-white opacity-90 hover:opacity-100 shadow-xs cursor-pointer"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-[#FF7A1A] text-white px-1.5 py-0.2 rounded-xs shadow-xs">
                        Cover
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Title & Category */}
            <div className="space-y-4 pt-2 border-t border-[#F2E7D7]">
              <Input
                label="Listing Title"
                placeholder="e.g. Higher Engineering Mathematics Dr. B.S. Grewal 44th Edition"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors({ ...errors, title: '' });
                }}
                error={errors.title}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A] mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ListingCategory)}
                    className="w-full px-4 py-2.5 bg-white border border-[#E8DFD3] rounded-2xl text-xs sm:text-sm font-semibold text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
                  >
                    <option value="Textbooks">Textbooks & Notes</option>
                    <option value="Electronics">Electronics & Laptops</option>
                    <option value="Cycles & Commute">Cycles & Commute</option>
                    <option value="Hostel Essentials">Hostel Essentials</option>
                    <option value="Lab & Drafting">Lab & Drafting</option>
                    <option value="Audio & Gadgets">Audio & Gadgets</option>
                    <option value="Fashion & Sports">Fashion & Sports</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A] mb-1.5">
                    Quantity Available
                  </label>
                  <div className="flex items-center gap-3 bg-[#FFFBF2] border-2 border-[#EFE6D8] rounded-2xl px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-full bg-white border border-[#EFE6D8] flex items-center justify-center font-bold text-[#1F1A17] cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-black text-sm text-[#1F1A17] flex-1 text-center">
                      {quantity} unit{quantity > 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                      className="w-7 h-7 rounded-full bg-white border border-[#EFE6D8] flex items-center justify-center font-bold text-[#1F1A17] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#F2E7D7]">
              <Input
                label="Your Selling Price (₹)"
                type="number"
                placeholder="e.g. 380"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value ? Number(e.target.value) : '');
                  if (errors.price) setErrors({ ...errors, price: '' });
                }}
                error={errors.price}
                helperText="Amount paid by the student at in-person handover"
                required
              />

              <Input
                label="Original MRP / New Price (₹)"
                type="number"
                placeholder="e.g. 850"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value ? Number(e.target.value) : '')}
                helperText="Displays discount percentage to juniors"
              />
            </div>

            {/* 4. Condition Chips */}
            <div className="space-y-2 pt-2 border-t border-[#F2E7D7]">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A]">
                Condition of the Item
              </label>
              <div className="flex flex-wrap gap-2">
                {(['Like New', 'Good', 'Fair', 'Heavily Used'] as ListingCondition[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    className={`px-4 py-2 rounded-full border-2 text-xs font-bold transition-all cursor-pointer ${
                      condition === c
                        ? 'bg-[#FF7A1A] border-[#FF7A1A] text-white shadow-sm'
                        : 'bg-[#FFF8EC] border-[#EFE6D8] text-[#1F1A17] hover:border-[#FFC72C]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Campus Pickup Spot */}
            <div className="space-y-2 pt-2 border-t border-[#F2E7D7]">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A]">
                Campus Pickup Landmark
              </label>
              <select
                value={pickupSpot}
                onChange={(e) => setPickupSpot(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#E8DFD3] rounded-2xl text-xs sm:text-sm font-semibold text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
              >
                {campusSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Or type a custom campus spot (e.g. Near Nescafe Booth / Basket Ball court)..."
                value={customSpot}
                onChange={(e) => setCustomSpot(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-[#E8DFD3] rounded-xl text-xs text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
              />
            </div>

            {/* 6. Specifications Key-Value Pairs */}
            <div className="space-y-3 pt-2 border-t border-[#F2E7D7]">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A]">
                  Item Specifications (Specs Table)
                </label>
                <button
                  type="button"
                  onClick={handleAddSpecRow}
                  className="text-xs font-bold text-[#FF7A1A] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>

              <div className="space-y-2">
                {specs.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="e.g. RAM, Edition, Author"
                      value={item.key}
                      onChange={(e) => handleUpdateSpec(idx, 'key', e.target.value)}
                      className="w-1/3 px-3 py-1.5 bg-white border border-[#E8DFD3] rounded-xl text-xs font-bold text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
                    />
                    <input
                      type="text"
                      placeholder="e.g. 16 GB, 44th, B.S. Grewal"
                      value={item.val}
                      onChange={(e) => handleUpdateSpec(idx, 'val', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white border border-[#E8DFD3] rounded-xl text-xs text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
                    />
                    {specs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSpec(idx)}
                        className="p-1.5 rounded-lg text-[#8C827A] hover:text-[#E5383B] hover:bg-[#FDE8E8] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 7. Description */}
            <div className="space-y-1.5 pt-2 border-t border-[#F2E7D7]">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B625A]">
                Description & Notes for Buyers
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) setErrors({ ...errors, description: '' });
                }}
                placeholder="Mention how long you used this, whether any accessories or notes are included, and when you can meet on campus..."
                className={`w-full px-4 py-3 bg-white border rounded-2xl text-xs sm:text-sm text-[#1F1A17] placeholder-[#A4998E] outline-none transition-all duration-200 focus:outline-none ${
                  errors.description
                    ? 'border-[#E5383B] focus:border-[#E5383B] focus:ring-4 focus:ring-[#E5383B]/[0.18]'
                    : 'border-[#E8DFD3] focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]'
                }`}
                required
              />
              {errors.description && (
                <p className="text-xs text-[#E5383B] font-semibold">{errors.description}</p>
              )}
            </div>

            {/* Action Buttons: Save Draft & Publish Listing */}
            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                fullWidth
                onClick={handleSaveDraft}
                icon={<Save className="w-4 h-4 text-[#8C6500]" />}
              >
                Save Draft
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isSubmitting}
                icon={<CheckCircle2 className="w-5 h-5" />}
              >
                Publish Listing
              </Button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Product-Card Preview */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-28">
          <div className="bg-[#FFF8EC] rounded-3xl p-5 border-2 border-[#FFD966] space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FF7A1A]" />
              <h3 className="font-extrabold text-sm text-[#1F1A17]">
                Live Campus Preview
              </h3>
            </div>
            <p className="text-xs text-[#6B625A]">
              This is in real-time how other students across your campus will see your listing in search and category feeds.
            </p>
          </div>

          <div className="max-w-sm mx-auto w-full">
            <ProductCard listing={previewListing} />
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#EFE6D8] text-xs text-[#6B625A] space-y-1 text-center">
            <span className="font-bold text-[#1F1A17] block">Campus Trade Guarantee</span>
            <p>
              Buyers must meet you in person at <strong>{customSpot.trim() || pickupSpot}</strong> and share their 4-digit PIN.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

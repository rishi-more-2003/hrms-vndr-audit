import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Scroll, CheckSquare, ChatCircleText, ArrowLeft, Rocket } from '@phosphor-icons/react';

const ICONS = { register_maker: Scroll, internal_audit: CheckSquare, consultancy: ChatCircleText };

export default function ComingSoonPage({ moduleKey, label, tagline, eta = 'Coming soon' }) {
  const nav = useNavigate();
  const Icon = ICONS[moduleKey] || Rocket;
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF9] via-[#F9F6F0] to-[#FBE8D9] flex items-center justify-center p-6" data-testid={`coming-soon-${moduleKey}`}>
      <div className="max-w-xl w-full bg-white border border-[#E8E2D9] rounded-3xl p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center mx-auto mb-5">
          <Icon size={28} color="white" weight="fill" />
        </div>
        <p className="text-xs uppercase tracking-[0.14em] text-[#D96C5B] font-bold mb-2">{eta}</p>
        <h1 className="text-3xl md:text-4xl font-semibold" style={{ fontFamily: 'Outfit' }}>{label}</h1>
        <p className="text-[#6A625E] mt-3">{tagline}</p>
        <p className="text-sm text-[#6A625E] mt-6">
          We're actively shaping this module with our labour-law consultants. Want to help define it? Send us your workflow and we'll prioritize it.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <Button onClick={() => nav('/#contact')} className="bg-[#D96C5B] hover:bg-[#C25949]">Shape this module</Button>
          <Button variant="outline" onClick={() => nav('/')}><ArrowLeft size={14} className="mr-1" /> Back to home</Button>
        </div>
      </div>
    </div>
  );
}

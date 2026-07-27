import { useState } from 'react';
import { X, Mic, Video, Check, ChevronRight } from 'lucide-react';

interface HostModalProps {
  onClose: () => void;
  onStart: (config: { title: string; topic: string; description: string; type: 'audio' | 'video' }) => void;
}

export function HostModal({ onClose, onStart }: HostModalProps) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'audio' | 'video'>('video');
  const [micChecked, setMicChecked] = useState(false);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [step, setStep] = useState<'setup' | 'device'>('setup');

  const canStart =
    title.trim().length > 0 &&
    topic.trim().length > 0 &&
    (type === 'audio' || cameraChecked) &&
    micChecked;

  const handleStart = () => {
    if (!canStart) return;
    onStart({ title: title.trim(), topic: topic.trim(), description: description.trim(), type });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-md overflow-hidden rounded-2xl border border-room-border bg-room-panel shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-room-border px-5 py-4">
          <h2 className="text-lg font-bold text-white">
            {step === 'setup' ? 'Host a Circle' : 'Device Check'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-room-hover hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {step === 'setup' ? (
          <div className="space-y-4 p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Circle Title
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Southside Community Circle"
                className="w-full rounded-lg border border-room-border bg-room-card px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-purple"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Topic
              </label>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Community Safety"
                className="w-full rounded-lg border border-room-border bg-room-card px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-purple"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What will this Circle be about?"
                rows={3}
                className="w-full resize-none rounded-lg border border-room-border bg-room-card px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-purple"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Circle Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setType('audio')}
                  className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                    type === 'audio'
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-room-border bg-room-card hover:bg-room-hover'
                  }`}
                >
                  <Mic size={18} className={type === 'audio' ? 'text-brand-purple-light' : 'text-gray-400'} />
                  <span className={`text-sm font-medium ${type === 'audio' ? 'text-white' : 'text-gray-400'}`}>
                    Audio
                  </span>
                </button>
                <button
                  onClick={() => setType('video')}
                  className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                    type === 'video'
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-room-border bg-room-card hover:bg-room-hover'
                  }`}
                >
                  <Video size={18} className={type === 'video' ? 'text-brand-purple-light' : 'text-gray-400'} />
                  <span className={`text-sm font-medium ${type === 'video' ? 'text-white' : 'text-gray-400'}`}>
                    Video
                  </span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setStep('device')}
              disabled={!title.trim() || !topic.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-purple py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-purple-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <p className="text-xs text-gray-400">
              Check your devices before going live. Click each button to test.
            </p>

            <button
              onClick={() => setMicChecked(c => !c)}
              className={`flex w-full items-center gap-3 rounded-lg border p-4 transition-colors ${
                micChecked
                  ? 'border-brand-green bg-brand-green/10'
                  : 'border-room-border bg-room-card hover:bg-room-hover'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  micChecked ? 'bg-brand-green/20' : 'bg-room-hover'
                }`}
              >
                <Mic size={18} className={micChecked ? 'text-brand-green' : 'text-gray-400'} />
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold text-white">Microphone</div>
                <div className="text-xs text-gray-500">
                  {micChecked ? 'Microphone is working' : 'Tap to test microphone'}
                </div>
              </div>
              {micChecked && <Check size={18} className="text-brand-green" />}
            </button>

            {type === 'video' && (
              <button
                onClick={() => setCameraChecked(c => !c)}
                className={`flex w-full items-center gap-3 rounded-lg border p-4 transition-colors ${
                  cameraChecked
                    ? 'border-brand-green bg-brand-green/10'
                    : 'border-room-border bg-room-card hover:bg-room-hover'
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    cameraChecked ? 'bg-brand-green/20' : 'bg-room-hover'
                  }`}
                >
                  <Video size={18} className={cameraChecked ? 'text-brand-green' : 'text-gray-400'} />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-white">Camera</div>
                  <div className="text-xs text-gray-500">
                    {cameraChecked ? 'Camera is working' : 'Tap to test camera'}
                  </div>
                </div>
                {cameraChecked && <Check size={18} className="text-brand-green" />}
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep('setup')}
                className="flex-1 rounded-lg border border-room-border bg-room-card py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-room-hover"
              >
                Back
              </button>
              <button
                onClick={handleStart}
                disabled={!canStart}
                className="flex-1 rounded-lg bg-brand-purple py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-purple-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start Circle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

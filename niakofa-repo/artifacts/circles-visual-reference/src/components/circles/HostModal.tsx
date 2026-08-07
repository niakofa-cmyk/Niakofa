import { useState } from 'react';
import { X, Mic, Video, Check, ChevronRight, MicOff, VideoOff } from 'lucide-react';

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
            aria-label="Close"
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
                className="w-full rounded-lg border border-room-border bg-room-card px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-brand-purple"
                aria-label="Circle title"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Topic
              </label>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="What's this Circle about?"
                className="w-full rounded-lg border border-room-border bg-room-card px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-brand-purple"
                aria-label="Topic"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add more context about your Circle..."
                rows={3}
                className="w-full resize-none rounded-lg border border-room-border bg-room-card px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-brand-purple"
                aria-label="Description"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setType('audio')}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                    type === 'audio'
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-room-border bg-room-card hover:bg-room-hover'
                  }`}
                >
                  <Mic
                    size={18}
                    className={type === 'audio' ? 'text-brand-purple-light' : 'text-gray-400'}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">Audio</div>
                    <div className="text-[10px] text-gray-500">Voice only</div>
                  </div>
                </button>
                <button
                  onClick={() => setType('video')}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                    type === 'video'
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-room-border bg-room-card hover:bg-room-hover'
                  }`}
                >
                  <Video
                    size={18}
                    className={type === 'video' ? 'text-brand-purple-light' : 'text-gray-400'}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">Video</div>
                    <div className="text-[10px] text-gray-500">Camera + voice</div>
                  </div>
                </button>
              </div>
            </div>

            <button
              onClick={() => setStep('device')}
              disabled={!title.trim() || !topic.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-purple py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-purple-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-lg bg-room-card p-3 text-xs text-gray-400">
              We need to verify your devices before going live.
            </div>

            <div className="space-y-3">
              <DeviceCheckRow
                icon={micChecked ? <Mic size={18} className="text-brand-green" /> : <MicOff size={18} className="text-gray-500" />}
                label="Microphone"
                status={micChecked ? 'Working' : 'Not checked'}
                checked={micChecked}
                onToggle={() => setMicChecked(v => !v)}
              />
              {type === 'video' && (
                <DeviceCheckRow
                  icon={cameraChecked ? <Video size={18} className="text-brand-green" /> : <VideoOff size={18} className="text-gray-500" />}
                  label="Camera"
                  status={cameraChecked ? 'Working' : 'Not checked'}
                  checked={cameraChecked}
                  onToggle={() => setCameraChecked(v => !v)}
                />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep('setup')}
                className="flex-1 rounded-lg border border-room-border bg-room-card py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-room-hover"
              >
                Back
              </button>
              <button
                onClick={handleStart}
                disabled={!canStart}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={16} />
                Start Circle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCheckRow({
  icon,
  label,
  status,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-room-border bg-room-card p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-room-hover">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-[11px] text-gray-500">{status}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-brand-green' : 'bg-room-border'}`}
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label} check`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

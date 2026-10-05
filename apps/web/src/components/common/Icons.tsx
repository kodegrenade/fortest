import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Clipboard,
  Clock,
  Copy,
  House,
  Inbox,
  Info,
  LayoutGrid,
  Layers,
  List,
  Monitor,
  Moon,
  Play,
  Plus,
  Save,
  SquarePen,
  Sun,
  Trash,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

// App icons are lucide icons at the app's default size of 16px (lucide defaults to 24).
const icon = (Icon: LucideIcon) => (props: LucideProps) => <Icon size={16} {...props} />;

export const AlertCircleIcon = icon(AlertCircle);
export const CheckCircleIcon = icon(CircleCheckBig);
export const ChevronDownIcon = icon(ChevronDown);
export const ChevronLeftIcon = icon(ChevronLeft);
export const ChevronRightIcon = icon(ChevronRight);
export const ClipboardIcon = icon(Clipboard);
export const ClockIcon = icon(Clock);
export const CopyIcon = icon(Copy);
export const EditIcon = icon(SquarePen);
export const GridIcon = icon(LayoutGrid);
export const HomeIcon = icon(House);
export const InboxIcon = icon(Inbox);
export const InfoIcon = icon(Info);
export const LayersIcon = icon(Layers);
export const ListIcon = icon(List);
export const MonitorIcon = icon(Monitor);
export const MoonIcon = icon(Moon);
export const PlayIcon = icon(Play);
export const PlusIcon = icon(Plus);
export const SaveIcon = icon(Save);
export const SunIcon = icon(Sun);
export const TrashIcon = icon(Trash);
export const XIcon = icon(X);

// Fortest's own marks (no lucide equivalent).
export const LogoIcon = ({ size = 16, className, ...rest }: LucideProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <polyline points="8 4 2 12 8 20" />
      <polyline points="16 4 22 12 16 20" />
      <line x1={14} y1={4} x2={10} y2={20} />
    </svg>
  );

export const BucketIcon = ({ size = 16, className, ...rest }: LucideProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M4 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M5 7h14a1 1 0 0 1 1 1v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a1 1 0 0 1 1-1z" />
      <line x1={8} y1={12} x2={16} y2={12} />
    </svg>
  );

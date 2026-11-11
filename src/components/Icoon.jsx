// src/components/Icoon.jsx — één icoon-ingang voor de hele Werkbank.
import {
  LayoutDashboard, Compass, Link, CalendarDays, FileText, Mic, Presentation,
  NotebookPen, ScanSearch, Puzzle, BookOpen, Paperclip, Search, Plus, SquarePen,
  History, Download, ExternalLink, RefreshCw, Star, ChevronRight, X, Check,
  TriangleAlert, Info, Moon, Sun, SunMoon,
  Circle, CircleDashed, CircleDot, CircleCheck, MessageSquare,
  ArrowUp, CornerDownLeft, LoaderCircle, Trash2, Undo2, Filter, ChevronDown,
} from 'lucide-react'

// Eén optische lijndikte (~1,3 px) over alle maten. Lucide tekent op een 24-raster:
// strokeWidth 2 op 16 px = 2 × 16/24 ≈ 1,33 px; 2,25 op 14 px ≈ 1,31 px.
const STROKE = { 12: 2.5, 14: 2.25, 16: 2, 18: 1.75, 20: 1.5 }

export const ICONEN = {
  overzicht: LayoutDashboard,
  planning: Compass,
  bronnen: Link,
  dagdeel: CalendarDays,
  document: FileText,
  spreektekst: Mic,
  slides: Presentation,
  werkboek: NotebookPen,
  research: ScanSearch,
  oefening: Puzzle,
  boek: BookOpen,
  paperclip: Paperclip,
  zoeken: Search,
  plus: Plus,
  bewerken: SquarePen,
  geschiedenis: History,
  downloaden: Download,
  extern: ExternalLink,
  vernieuwen: RefreshCw,
  ster: Star,
  chevronRechts: ChevronRight,
  chevronOnder: ChevronDown,
  sluiten: X,
  vinkje: Check,
  waarschuwing: TriangleAlert,
  info: Info,
  maan: Moon,
  zon: Sun,
  autoThema: SunMoon,
  statusLeeg: Circle,
  statusConcept: CircleDashed,
  statusReview: CircleDot,
  statusKlaar: CircleCheck,
  inhoud: MessageSquare, // treffers in het ⌘K-palet
  pijlOmhoog: ArrowUp,
  enter: CornerDownLeft,
  laden: LoaderCircle,
  verwijderen: Trash2,
  ongedaan: Undo2,
  filter: Filter,
}

// Soort stuk -> icoonnaam, zodat overal dezelfde tekens staan.
export const SOORT_ICOON = {
  brief: 'document',
  spreektekst: 'spreektekst',
  slides: 'slides',
  werkboek: 'werkboek',
  oefening: 'oefening',
  research: 'research',
  bron: 'bronnen',
  algemeen: 'boek',
  overig: 'paperclip',
}

export function Icoon({ naam, maat = 16, stroke, className, ...rest }) {
  const Icon = ICONEN[naam]
  if (!Icon) return null
  return (
    <Icon
      size={maat}
      strokeWidth={stroke ?? STROKE[maat] ?? 2}
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  )
}

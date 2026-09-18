import { useTheme, useUser } from '@company/mfe-react';
import { Badge } from '@tecton/react/components/badge';
import { Button } from '@tecton/react/components/button';
import {
  CheckCircleOpenIcon,
  ChevronDownIcon,
  DatabaseIcon,
  ExportUploadIcon,
  LayersIcon,
  PanelIcon,
  RotateIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@tecton/react/icons';
import { AppShellBody, AppShellMain, AppShellSidebar } from '@tecton/react/tecton/app-shell';
import { PageHeader, PageHeaderContent, PageHeaderTitle } from '@tecton/react/tecton/page-header';
import { useId, useState } from 'react';
import { useTraceProbe } from '../trace-probe';

type PresetKind = 'map' | 'strata' | 'wells' | 'property';
type Layer = 'fields' | 'prospects' | 'surveys';
type SwatchKind = 'prospect' | 'field' | 'basin' | 'terrace' | 'facies' | 'water';

const presets: readonly { title: string; kind: PresetKind; started: boolean }[] = [
  { title: 'Geologic Background', kind: 'map', started: true },
  { title: 'Framework Model', kind: 'strata', started: true },
  { title: 'Well Correlation', kind: 'wells', started: false },
  { title: 'Property Model', kind: 'property', started: false },
];

export function GeologyScreen() {
  const user = useUser();
  useTraceProbe('geology');
  const theme = useTheme();
  const [preset, setPreset] = useState(presets[0]!);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(
    new Set(['fields', 'prospects', 'surveys']),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');

  function toggleLayer(layer: Layer) {
    setLayers((previous) => {
      const next = new Set(previous);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  function shareView() {
    if (!navigator.clipboard) {
      setShareStatus('Copy the address from your browser to share this view.');
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(
      () => setShareStatus('Link copied to clipboard.'),
      () => setShareStatus('Copy the address from your browser to share this view.'),
    );
  }

  return (
    <AppShellBody
      className="relative h-full bg-background text-foreground"
      data-testid="geology-app"
    >
      <AppShellSidebar
        className={
          sidebarOpen
            ? 'absolute inset-y-0 left-0 z-20 shadow-xl md:static md:shadow-none'
            : 'hidden md:flex'
        }
        aria-label="Map presets"
      >
        <div className="flex items-center justify-between px-3 py-4">
          <h2 className="text-sm font-medium">Pre-sets</h2>
          <ChevronDownIcon size={19} className="text-muted-foreground" />
        </div>
        <div className="grid gap-3 px-2">
          {presets.map((item) => (
            <button
              key={item.title}
              className="min-w-0 cursor-pointer rounded-lg border border-border bg-card p-2 text-left text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-ring"
              aria-pressed={preset.title === item.title}
              onClick={() => {
                setPreset(item);
                setZoom(1);
                setSidebarOpen(false);
              }}
            >
              <div className="relative h-28 overflow-hidden rounded-sm">
                <PresetPreview kind={item.kind} />
                <span className="absolute top-1/2 left-1/2 flex size-9 -translate-1/2 items-center justify-center rounded-full border-4 border-primary/30 bg-primary/80 bg-clip-padding text-primary-foreground">
                  <DatabaseIcon size={18} />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs">{item.title}</span>
                <Badge variant={item.started ? 'info' : 'secondary'}>
                  {item.started ? 'In progress' : 'Not started'}
                </Badge>
              </div>
            </button>
          ))}
        </div>
        <div
          className="mt-auto flex flex-wrap items-center gap-1.5 px-3 pt-6 pb-4 text-xs text-muted-foreground"
          data-testid="geology-session"
        >
          <span className="size-1.5 rounded-full bg-success" />
          {user?.name ?? 'Guest'} · {theme === 'dark' ? 'Dark' : 'Light'} theme
        </div>
      </AppShellSidebar>
      <AppShellMain>
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border-subtle bg-background p-3">
            <PageHeader>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle map presets"
                aria-expanded={sidebarOpen}
                onPress={() => setSidebarOpen((value) => !value)}
                className="md:hidden"
              >
                <PanelIcon />
              </Button>
              <PageHeaderContent className="max-sm:basis-[calc(100%-3.75rem)]">
                <PageHeaderTitle>{preset.title}</PageHeaderTitle>
              </PageHeaderContent>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  aria-label="Review"
                  aria-expanded={reviewOpen}
                  onPress={() => setReviewOpen((value) => !value)}
                >
                  <ExportUploadIcon />
                  <span className="hidden sm:inline">Review</span>
                </Button>
                <Button variant="secondary" onPress={shareView}>
                  Share
                </Button>
              </div>
            </PageHeader>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <GeologicMap zoom={zoom} layers={layers} kind={preset.kind} />
            <div className="absolute top-4 left-4 grid justify-items-start gap-2">
              <span className="rounded-sm border border-border bg-card px-2.5 py-2 text-sm text-card-foreground shadow-sm">
                {preset.kind === 'map' ? 'Fairway Map' : preset.title}
              </span>
              <small className="rounded-sm border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground shadow-sm">
                {preset.kind === 'wells' ? 'Well section' : 'Depth · metres'}
              </small>
            </div>
            <div className="absolute top-4 right-4 grid justify-items-end gap-4">
              <span className="hidden rounded-sm border border-border bg-card px-2.5 py-2 text-sm text-card-foreground shadow-sm md:inline">
                Regional Geology
              </span>
              <span
                className="rounded-sm bg-card/95 p-2 font-mono text-xs text-card-foreground"
                aria-label="North"
              >
                ↑ N
              </span>
            </div>
            <div className="absolute top-28 left-4 grid gap-2.5" aria-label="Map controls">
              <div className="grid gap-0.5 rounded-md border border-border bg-card p-1 text-card-foreground shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom in"
                  isDisabled={zoom >= 2}
                  onPress={() => setZoom((value) => Math.min(2, value + 0.25))}
                >
                  <ZoomInIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom out"
                  isDisabled={zoom <= 0.75}
                  onPress={() => setZoom((value) => Math.max(0.75, value - 0.25))}
                >
                  <ZoomOutIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset map view"
                  onPress={() => setZoom(1)}
                >
                  <RotateIcon />
                </Button>
              </div>
              <div className="grid gap-0.5 rounded-md border border-border bg-card p-1 text-card-foreground shadow-sm">
                <Button
                  variant={layersOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-label="Map layers"
                  aria-expanded={layersOpen}
                  onPress={() => setLayersOpen((value) => !value)}
                >
                  <LayersIcon />
                </Button>
              </div>
              {layersOpen && (
                <fieldset className="absolute top-28 left-12 grid w-48 gap-3 rounded-lg border border-border bg-popover p-3.5 text-popover-foreground shadow-lg">
                  <legend className="rounded-sm bg-popover px-1.5 py-1 text-xs">
                    Visible layers
                  </legend>
                  {(
                    [
                      ['fields', 'Existing fields'],
                      ['prospects', 'Prospect areas'],
                      ['surveys', 'Survey boundaries'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        checked={layers.has(key)}
                        onChange={() => toggleLayer(key)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
            <div
              className="absolute bottom-4 left-4 grid gap-2 rounded-sm border border-border bg-card/95 p-2 text-xs text-card-foreground sm:p-3"
              aria-label="Map legend"
            >
              {(
                [
                  ['prospect', 'Prospect areas'],
                  ['field', 'Existing fields'],
                  ['basin', 'Sub-basin'],
                  ['terrace', 'Terrace'],
                  ['facies', 'Facies belt'],
                  ['water', 'Water bodies'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <MapLegendSwatch kind={key} />
                  {label}
                </div>
              ))}
            </div>
            <div className="absolute right-4 bottom-4 grid grid-cols-[3rem_auto] items-center gap-1.5 rounded-sm bg-card/95 p-2 font-mono text-xs text-card-foreground sm:grid-cols-[6rem_auto] sm:gap-x-2.5">
              <span aria-hidden="true" className="h-2 border-x border-b border-current" />
              <span>{Math.round(750 / zoom)} m</span>
              <span aria-hidden="true" className="h-2 w-4/5 border-x border-t border-current" />
              <span>{Math.round(2500 / zoom).toLocaleString('en-US')} ft</span>
              <small
                className="col-span-2 text-right text-xs text-muted-foreground"
                aria-live="polite"
              >
                {Math.round(zoom * 100)}% zoom
              </small>
            </div>
            {reviewOpen && (
              <section
                className="absolute top-4 right-4 z-10 w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl"
                aria-label="Map review"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium">Ready for a closer look</h2>
                  <Button variant="ghost" size="sm" onPress={() => setReviewOpen(false)}>
                    Close
                  </Button>
                </div>
                <p className="mt-3 text-xs">Geologic Background · Orion Discovery</p>
                <ul className="my-5 grid gap-3 text-xs">
                  <li className="flex items-center gap-2">
                    <CheckCircleOpenIcon size={17} className="text-success" />3 prospect areas
                    mapped
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleOpenIcon size={17} className="text-success" />
                    Existing field boundaries added
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleOpenIcon size={17} className="text-success" />
                    Regional survey coverage linked
                  </li>
                </ul>
                <small className="text-xs text-muted-foreground">
                  Changes in this test workspace stay in your session.
                </small>
              </section>
            )}
            {shareStatus && (
              <div
                className="absolute right-4 bottom-24 z-20 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-sm"
                role="status"
              >
                {shareStatus}
                <Button size="sm" variant="ghost" onPress={() => setShareStatus('')}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </div>
      </AppShellMain>
    </AppShellBody>
  );
}

// These colors identify geological data layers and match the map illustration.
const layerColors: Readonly<Record<Exclude<SwatchKind, 'prospect'>, string>> = {
  field: '#2a9e9b',
  basin: '#c28351',
  terrace: '#91a540',
  facies: '#88a0d0',
  water: '#b68179',
};

function MapLegendSwatch({ kind }: { kind: SwatchKind }) {
  const id = useId();
  return (
    <svg className="size-3 shrink-0" viewBox="0 0 12 12" aria-hidden="true">
      {kind === 'prospect' && (
        <defs>
          <pattern
            id={id}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <path d="M0 0V4" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
      )}
      <rect
        width="12"
        height="12"
        rx="2"
        fill={kind === 'prospect' ? `url(#${id})` : layerColors[kind]}
      />
    </svg>
  );
}

function PresetPreview({ kind }: { kind: PresetKind }) {
  return (
    <svg className="size-full" viewBox="0 0 280 130" aria-hidden="true" preserveAspectRatio="none">
      <rect width="280" height="130" fill={kind === 'map' ? '#3d2f26' : '#29242e'} />
      {kind === 'map' ? (
        <>
          <path d="M0 88 C57 42 115 109 191 59 S265 59 280 59V130H0Z" fill="#626373" />
          <path
            d="M53 40 C98 9 157 48 165 73C129 107 72 79 53 40Z"
            fill="#356d6c"
            stroke="#a6b6b0"
            strokeWidth="1.5"
          />
          <ellipse
            cx="223"
            cy="77"
            rx="29"
            ry="21"
            fill="#478a94"
            stroke="#a6b6b0"
            strokeWidth="1.5"
          />
        </>
      ) : kind === 'wells' ? (
        <>
          {Array.from({ length: 9 }, (_, index) => (
            <rect key={index} x={14 + index * 30} y="8" width="14" height="114" fill="#775540" />
          ))}
          <path d="M14 40H266M14 76H266" stroke="#849240" strokeWidth="1.5" />
        </>
      ) : (
        <>
          {Array.from({ length: 12 }, (_, index) => (
            <path
              key={index}
              d={`M0 ${9 + index * 10} C84 ${index * 10 - 4} 174 ${index * 10 + 28} 280 ${index * 10 + 9}`}
              fill="none"
              stroke={kind === 'property' && index % 3 === 0 ? '#99866c' : '#66616e'}
              strokeWidth="1.4"
            />
          ))}
        </>
      )}
    </svg>
  );
}

function GeologicMap({
  zoom,
  layers,
  kind,
}: {
  zoom: number;
  layers: ReadonlySet<Layer>;
  kind: PresetKind;
}) {
  const id = useId().replaceAll(':', '');
  const transform = `translate(700 420) scale(${zoom}) translate(-700 -420)`;
  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox="0 0 1400 840"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${kind === 'map' ? 'Geological' : kind === 'wells' ? 'Well correlation' : 'Subsurface model'} map of Orion Alpha and Orion West prospects`}
    >
      <defs>
        <pattern id={`${id}-grid`} width="140" height="140" patternUnits="userSpaceOnUse">
          <path d="M140 0H0V140" fill="none" stroke="#fff" strokeOpacity=".045" />
        </pattern>
        <pattern
          id={`${id}-prospect`}
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(40)"
        >
          <path d="M0 0V9" stroke="#e4dbcf" strokeOpacity=".65" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width="1400" height="840" fill="#493b35" />
      <g transform={transform}>
        <path d="M0 0H986C912 200 974 335 780 489S628 695 470 840H0Z" fill="#4d4932" />
        <path d="M1147 0C1090 220 1211 350 1284 533S1358 738 1400 840V0Z" fill="#624941" />
        <path
          d="M-70 655C100 551 246 548 410 431S614 285 661 271C713 360 625 483 535 590S382 749 199 879H-70Z"
          fill="#7b8597"
          fillOpacity=".63"
        />
        <ellipse
          cx="275"
          cy="647"
          rx="89"
          ry="66"
          transform="rotate(-25 275 647)"
          fill="#ae827c"
          fillOpacity=".78"
        />
        {kind === 'property' && (
          <path
            d="M170 0C50 260 716 423 665 840H915C1012 483 466 201 578 0Z"
            fill="#91833e"
            fillOpacity=".28"
          />
        )}
        {kind === 'strata' &&
          Array.from({ length: 19 }, (_, index) => (
            <path
              key={index}
              d={`M-30 ${index * 46}C450 ${index * 39 - 100} 719 ${index * 46 + 160} 1440 ${index * 40 + 45}`}
              stroke="#d5cbc0"
              strokeOpacity=".24"
              fill="none"
              strokeWidth="2"
            />
          ))}
        {layers.has('fields') && (
          <g fill="#377f7b" fillOpacity=".76" stroke="#aec1b8" strokeWidth="1.6">
            <path d="M142 188L212 115 310 100 409 129 468 198 453 297 397 352 300 352 160 282 118 239Z" />
            <path d="M1063 129L1147 100 1232 136 1260 211 1232 294 1175 337 1105 322 1063 267 1035 198Z" />
            <path d="M787 422L901 381 1013 410 1126 467 1197 566 1169 664 1070 706 958 692 859 636 790 551 760 480Z" />
          </g>
        )}
        {layers.has('surveys') && (
          <g
            fill="none"
            stroke="#b6acbb"
            strokeOpacity=".6"
            strokeDasharray="2 6"
            strokeWidth="1.4"
          >
            <path d="M77 155L666 100 694 422 104 479Z" />
            <path d="M385 422H650V733H385Z" />
            <path d="M732 380H1295V762H732Z" />
          </g>
        )}
        {layers.has('prospects') && (
          <g fill={`url(#${id}-prospect)`} stroke="#e3ddd0" strokeOpacity=".84" strokeWidth="1.3">
            <path d="M413 464L497 423 595 436 624 494 582 549 483 563 413 535Z" />
            <path d="M455 605L512 585 554 613 546 669 497 690 455 662Z" />
            <path d="M596 620L623 606 638 642 629 683 601 688 584 654Z" />
          </g>
        )}
        {kind === 'wells' && (
          <g stroke="#dbc980" strokeWidth="3" fill="none">
            {Array.from({ length: 7 }, (_, index) => (
              <path
                key={index}
                d={`M${370 + index * 52} 72V${430 + index * 25}l${40 + index * 9} 95`}
              />
            ))}
          </g>
        )}
        <g fill="#f1eae2" fontFamily="'IBM Plex Mono', monospace" fontSize="17" textAnchor="middle">
          {layers.has('fields') && (
            <>
              <text x="295" y="233">
                Field Name
              </text>
              <text x="1147" y="227">
                Field Name
              </text>
              <text x="991" y="567">
                Orion Alpha
              </text>
            </>
          )}
          {layers.has('prospects') && (
            <>
              <text x="511" y="496">
                Orion West A
              </text>
              <text x="500" y="641">
                Orion West B
              </text>
              <text x="614" y="656">
                Orion West C
              </text>
            </>
          )}
        </g>
        {layers.has('surveys') && (
          <g fill="#b9b0ad" fillOpacity=".7" fontFamily="'IBM Plex Mono', monospace" fontSize="16">
            <text x="118" y="493">
              Survey Name
            </text>
            <text x="398" y="747">
              Survey Name
            </text>
            <text x="745" y="777">
              Survey Name
            </text>
          </g>
        )}
        <rect width="1400" height="840" fill={`url(#${id}-grid)`} />
      </g>
    </svg>
  );
}

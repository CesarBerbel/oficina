import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderEventDto,
} from '@oficina/shared';
import {
  Camera,
  CheckSquare,
  CircleDot,
  MessageCircle,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const TYPE_LABELS: Record<ServiceOrderEventDto['type'], string> = {
  STATUS_CHANGE: 'Status',
  NOTE: 'Nota',
  CHECKLIST: 'Checklist',
  PHOTOS: 'Fotos',
  CUSTOMER_NOTIFICATION: 'Cliente',
  SYSTEM: 'Sistema',
};

const TYPE_ICON: Record<ServiceOrderEventDto['type'], LucideIcon> = {
  STATUS_CHANGE: CircleDot,
  NOTE: StickyNote,
  CHECKLIST: CheckSquare,
  PHOTOS: Camera,
  CUSTOMER_NOTIFICATION: MessageCircle,
  SYSTEM: CircleDot,
};

export function OsEventTimeline({ events }: { events: ServiceOrderEventDto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Timeline da OS</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento operacional registrado.
          </p>
        ) : (
          <ol className="relative space-y-5 border-l pl-4">
            {events.map((event) => {
              const Icon = TYPE_ICON[event.type];
              return (
                <li key={event.id} className="relative space-y-2">
                  <span className="absolute -left-[1.65rem] top-0.5 grid size-6 place-items-center rounded-full border bg-background">
                    <Icon className="size-3.5 text-primary" />
                  </span>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{event.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString('pt-BR')}
                        {event.createdByName ? ` · ${event.createdByName}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Badge variant="secondary">{TYPE_LABELS[event.type]}</Badge>
                      {event.visibility === 'PUBLIC' && (
                        <Badge variant="outline">cliente</Badge>
                      )}
                    </div>
                  </div>

                  {event.fromStatus && event.toStatus && (
                    <p className="text-xs text-muted-foreground">
                      {SERVICE_ORDER_STATUS_LABELS[event.fromStatus]} →{' '}
                      {SERVICE_ORDER_STATUS_LABELS[event.toStatus]}
                    </p>
                  )}
                  {event.description && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {event.description}
                    </p>
                  )}
                  {event.checklist.length > 0 && (
                    <ul className="space-y-1 rounded-lg border bg-muted/30 p-2 text-xs">
                      {event.checklist.map((item, index) => (
                        <li key={`${event.id}-check-${index}`}>
                          <span className="font-medium">
                            {item.done ? '✓' : '○'} {item.item}
                          </span>
                          {item.note && (
                            <span className="text-muted-foreground"> — {item.note}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {event.photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {event.photos.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-md border bg-muted"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Foto técnica da OS"
                            className="aspect-square w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

import { cn } from "@/lib/utils";
import { DASHBOARD_PANEL_CLASS } from "@/lib/dashboardChartTheme";

interface DashboardPanelProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function DashboardPanel({
  title,
  action,
  children,
  className,
  testId,
}: DashboardPanelProps) {
  return (
    <div className={cn(DASHBOARD_PANEL_CLASS, className)} data-testid={testId}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

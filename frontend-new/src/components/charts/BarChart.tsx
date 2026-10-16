import React from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

const ACCENT_SHADES = [
  "#6E9BD6", // accent
  "#5E87BC", // accent-dark-1
  "#4E72A2", // accent-dark-2
  "#415E86", // accent-dark-3
  "#344A69", // accent-dark-4
];

interface BarChartProps<T = unknown> {
  data: T[];
  xKey: string;
  yKey: string;
  title?: string;
  subtitle?: string;
  height?: number;
  formatY?: (value: number) => string;
  formatTooltip?: (value: number) => string;
}

export function BarChart<T>({
  data,
  xKey,
  yKey,
  title,
  subtitle,
  height = 280,
  formatY = (v) => `${(v * 100).toFixed(0)}%`,
  formatTooltip = (v) => `${(v * 100).toFixed(2)}%`,
}: BarChartProps<T>) {
  return (
    <div className="card p-5">
      {title && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={data}
            margin={{ top: 10, right: 10, left: -10, bottom: 25 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#232A38"
              vertical={false}
            />
            <XAxis
              dataKey={xKey}
              stroke="#6E7585"
              fontSize={11}
              tickLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
            />
            <YAxis
              stroke="#6E7585"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatY}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0 && payload[0]) {
                  const item = payload[0].payload as Record<string, unknown>;
                  const rawVal = Number(item[yKey] ?? 0);
                  return (
                    <div className="rounded-lg border border-border bg-bg-card p-2.5 shadow-lg">
                      <div className="text-xs font-medium text-text-secondary">
                        {String(item[xKey])}
                      </div>
                      <div className="mt-1 text-sm font-bold text-accent">
                        {formatTooltip(rawVal)}
                      </div>
                      {item.n !== undefined && (
                        <div className="text-[11px] text-text-muted mt-0.5">
                          Sample size: {Number(item.n).toLocaleString()} claims
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={ACCENT_SHADES[index % ACCENT_SHADES.length]}
                />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

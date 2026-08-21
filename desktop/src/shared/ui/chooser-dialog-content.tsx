import * as React from "react";

import { cn } from "@/shared/lib/cn";

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

type ChooserDialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogContent
> & {
  description?: React.ReactNode;
  footer?: React.ReactNode;
  footerClassName?: string;
  footerTestId?: string;
  contentClassName?: string;
  headerClassName?: string;
  /**
   * Put title, subtitle, and `headerTrailing` on one toolbar row.
   * Long titles truncate instead of wrapping into a second block.
   */
  headerInline?: boolean;
  headerSubtitle?: React.ReactNode;
  headerTestId?: string;
  /** Controls that sit on the title row (tabs, icon buttons). */
  headerTrailing?: React.ReactNode;
  scrollAreaClassName?: string;
  scrollAreaTestId?: string;
  title: React.ReactNode;
  titleClassName?: string;
};

export const ChooserDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  ChooserDialogContentProps
>(
  (
    {
      children,
      className,
      contentClassName,
      description: _description,
      footer,
      footerClassName,
      footerTestId,
      headerClassName,
      headerInline = false,
      headerSubtitle,
      headerTestId,
      headerTrailing,
      scrollAreaClassName,
      scrollAreaTestId,
      title,
      titleClassName,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref,
  ) => (
    <DialogContent
      aria-describedby={ariaDescribedBy}
      className={cn(
        "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0",
        className,
      )}
      ref={ref}
      {...props}
    >
      <DialogHeader
        className={cn(
          "shrink-0 px-6 pr-14",
          headerInline ? "flex-row items-center gap-3 space-y-0 py-3" : "py-5",
          headerClassName,
        )}
        data-header-layout={headerInline ? "toolbar" : "stack"}
        data-testid={headerTestId}
      >
        <div
          className={cn(
            "min-w-0",
            headerInline && "flex min-w-0 flex-1 items-center gap-2",
          )}
        >
          <DialogTitle
            className={cn(
              headerInline && "min-w-0 flex-1 truncate",
              titleClassName,
            )}
          >
            {title}
          </DialogTitle>
          {headerSubtitle ? (
            <DialogDescription className={cn(headerInline && "shrink-0")}>
              {headerSubtitle}
            </DialogDescription>
          ) : null}
        </div>
        {headerTrailing ? (
          <div className="flex shrink-0 items-center gap-2">
            {headerTrailing}
          </div>
        ) : null}
      </DialogHeader>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-6",
          scrollAreaClassName,
        )}
        data-testid={scrollAreaTestId}
      >
        <div className={cn("py-5", contentClassName)}>{children}</div>
      </div>

      {footer ? (
        <div
          className={cn(
            "flex shrink-0 border-t border-border/60 px-6 py-4",
            footerClassName,
          )}
          data-testid={footerTestId}
        >
          {footer}
        </div>
      ) : null}
    </DialogContent>
  ),
);
ChooserDialogContent.displayName = "ChooserDialogContent";

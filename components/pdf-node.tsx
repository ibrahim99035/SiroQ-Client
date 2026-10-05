"use client";

import * as React from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { Eye, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import type { PdfAttachment } from "@/lib/report-blocks";

/**
 * A PDF already uploaded to the filing, quoted inside a narrative section.
 *
 * The node carries no copy of the document and no bytes. It stores the file's
 * id, the name it had when it was quoted, and the authorized download path the
 * server built for it — so the card renders on its own, with no lookup against
 * the filing's file list and nothing that has to be kept in step with it.
 *
 * Authorization is not this node's problem. The path is the same
 * tenant-scoped content route the download button already uses, so the browser
 * asks for the bytes with the reader's own session and the route decides. A
 * `fileId` belonging to some other tenant resolves to a 404, which the card
 * renders as "no longer on the filing" — the same state a genuinely deleted
 * document shows, and the only thing a hand-edited document can provoke.
 */

/** A PDF the filing holds, as offered to the picker. */
export type { PdfAttachment };

export const PDF_NODE_NAME = "pdf";

function PdfNodeView({ node, deleteNode, editor }: ReactNodeViewProps) {
  const attrs = node.attrs as { fileId: string; filename: string; url: string | null };
  const [open, setOpen] = React.useState(false);

  const filename = attrs.filename?.trim() || "Document";
  const url = attrs.url?.trim() || null;
  // The editor is the authority on whether this is an editing surface. The
  // read-only report runs the same node with the same markup, and the only
  // difference the reader should see is that there is nothing to remove.
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper className="my-2">
      <div className="flex items-center gap-3 rounded-md border border-hairline/60 bg-surface/60 px-3 py-2">
        <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={filename}>
          {filename}
        </span>
        {url ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 px-2 text-[11px]"
            onClick={() => setOpen(true)}
          >
            <Eye className="mr-1 h-3 w-3" aria-hidden="true" />
            View
          </Button>
        ) : (
          <span className="shrink-0 text-[10px] text-muted">no longer on the filing</span>
        )}
        {editable ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            aria-label={`Remove “${filename}” from this section`}
            onClick={deleteNode}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {url ? (
        <PdfViewerDialog
          open={open}
          onOpenChange={setOpen}
          filename={filename}
          url={url}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

/**
 * Hands events from the card's own controls back to the browser instead of
 * letting ProseMirror swallow them.
 *
 * Without this the View and Remove buttons sit inside a node view but not inside
 * its `contentDOM`, so ProseMirror treats a click on them as a click on the
 * document — the button never fires and the click just selects the node.
 * Everything that is not a control still goes through, so the node can be
 * selected and dragged.
 */
function stopEvent({ event }: { event: Event }): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
}

export const PdfBlock = Node.create({
  name: PDF_NODE_NAME,

  group: "block",
  // An atom has no editable content of its own, which is what a reference is:
  // it is a single thing on the page, selected and moved as a unit, rather than
  // a paragraph a reader can type inside.
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      fileId: { default: null },
      filename: { default: null },
      url: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-pdf-file-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { fileId, filename, url } = HTMLAttributes as {
      fileId: string | null;
      filename: string | null;
      url: string | null;
    };
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-pdf-file-id": fileId ?? "",
        "data-pdf-filename": filename ?? "",
        "data-pdf-url": url ?? "",
        class: "pdf-block",
      }),
      filename ?? "Document",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfNodeView, { stopEvent });
  },
});

/**
 * Toolbar control for quoting a filing PDF into the section being edited.
 *
 * Only the PDFs the reader can actually open are listed. A file whose bytes were
 * never stored — the seeded fixtures in the demo data — would produce a card
 * whose every viewer click 404s, so offering it would be offering a dead end.
 */
export function PdfPickerButton({
  pdfs,
  onPick,
}: {
  pdfs: PdfAttachment[];
  onPick: (pdf: PdfAttachment) => void;
}) {
  const openable = pdfs.filter((pdf) => pdf.downloadable);
  const none = openable.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 w-7 p-0"
          title="Quote a PDF from this filing"
        >
          <FileText className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-xs">
        {none ? (
          <DropdownMenuItem disabled className="text-[11px]">
            No PDFs on this filing
          </DropdownMenuItem>
        ) : (
          openable.map((pdf) => (
            <DropdownMenuItem
              key={pdf.id}
              onSelect={() => onPick(pdf)}
              className="text-[11px]"
            >
              <FileText className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pdf.filename}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
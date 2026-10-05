"use client";

import * as React from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ReportRichText } from "@/components/rich-text-renderer";
import {
  emptyDoc,
  isBlankDoc,
  nextBlockKey,
  type PdfAttachment,
  type RichTextBlock,
} from "@/lib/report-blocks";

interface ReportRichBlocksProps {
  blocks: RichTextBlock[];
  onChange: (blocks: RichTextBlock[]) => void;
  editable?: boolean;
  /** The filing's PDFs, so a section can quote one. Read-only when absent. */
  pdfs?: PdfAttachment[];
}

/**
 * The block list, with add / edit / delete for a super admin.
 *
 * The dialog edits a draft and only publishes on Save. It used to add the new
 * block to the document as soon as *Add* was pressed and open the editor on top
 * of it, so dismissing the dialog — the ordinary way to abandon a paragraph —
 * still left an empty block behind in the report.
 *
 * Document handling lives in `@/lib/report-blocks`, not here: the merge that
 * writes these blocks back has to preserve the service's own keys, and it is
 * pure enough to test without a DOM.
 */
export function ReportRichBlocks({
  blocks,
  onChange,
  editable = false,
  pdfs = [],
}: ReportRichBlocksProps) {
  const [draft, setDraft] = React.useState<RichTextBlock | null>(null);

  const openExisting = (block: RichTextBlock) => setDraft(block);
  const openNew = () => setDraft({ id: "", title: "", content: emptyDoc() });

  const commit = () => {
    if (!draft) return;
    // A section that is neither titled nor written is abandoned rather than
    // saved: an empty narrative block is noise in a delivered report, and this
    // is the state Add leaves behind when the author changes their mind.
    if (!draft.title?.trim() && isBlankDoc(draft.content)) {
      setDraft(null);
      return;
    }
    const next = blocks.filter((block) => block.id !== draft.id);
    next.push({
      ...draft,
      id: draft.id || nextBlockKey(blocks.map((block) => block.id)),
    });
    onChange(next);
    setDraft(null);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block.id} className="group relative rounded-md border border-hairline/40">
          <ReportRichText content={block.content} title={block.title} />
          {editable ? (
            /* The controls are reachable by keyboard, not only by hover: the
               group is hovered only when a pointer is over it, which would
               otherwise hide them from anyone tabbing through the report. */
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={block.title ? `Edit “${block.title}”` : "Edit narrative block"}
                onClick={() => openExisting(block)}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={block.title ? `Delete “${block.title}”` : "Delete narrative block"}
                onClick={() => onChange(blocks.filter((other) => other.id !== block.id))}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {editable ? (
        <Button variant="outline" size="sm" onClick={openNew} className="text-[12px]">
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Add narrative section
        </Button>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              {draft?.id ? "Edit narrative section" : "Add narrative section"}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <RichTextEditor
                value={draft.content}
                onChange={(content) => setDraft({ ...draft, content })}
                title={draft.title}
                onTitleChange={(title) => setDraft({ ...draft, title })}
                minHeight="300px"
                pdfs={pdfs}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Cancel
                </Button>
                <Button size="sm" onClick={commit}>
                  <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

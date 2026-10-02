"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ReportRichText } from "@/components/rich-text-renderer";

export interface RichTextBlock {
  id: string;
  title?: string;
  content: unknown;
}

interface ReportRichBlocksProps {
  blocks: RichTextBlock[];
  onChange: (blocks: RichTextBlock[]) => void;
  editable?: boolean;
}

export function ReportRichBlocks({ blocks, onChange, editable = false }: ReportRichBlocksProps) {
  const [editing, setEditing] = React.useState<RichTextBlock | null>(null);

  const handleAdd = () => {
    const newBlock: RichTextBlock = {
      id: `rt-${Date.now()}`,
      title: "",
      content: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    };
    onChange([...blocks, newBlock]);
    setEditing(newBlock);
  };

  const handleSave = () => {
    if (!editing) return;
    const next = blocks.map((b) => (b.id === editing.id ? editing : b));
    onChange(next);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block.id} className="relative group border border-hairline/40 rounded-md">
          <ReportRichText content={block.content} title={block.title} />
          {editable ? (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setEditing(block)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleDelete(block.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {editable ? (
        <Button variant="outline" size="sm" onClick={handleAdd} className="text-[12px]">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add rich text block
        </Button>
      ) : null}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Edit rich text block</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <RichTextEditor
                value={editing.content}
                onChange={(content) => setEditing({ ...editing, content })}
                title={editing.title}
                onTitleChange={(title) => setEditing({ ...editing, title })}
                minHeight="300px"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-3.5 w-3.5 mr-1" />
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

export function blocksToResultData(blocks: RichTextBlock[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  blocks.forEach((b, i) => {
    out[`Rich text ${i + 1}`] = {
      $rich: {
        content: b.content as unknown,
        ...(b.title ? { title: b.title } : {}),
      },
    };
  });
  return out;
}

export function resultDataToBlocks(resultData: Record<string, unknown>): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  Object.entries(resultData).forEach(([key, value]) => {
    if (value && typeof value === "object" && "$rich" in (value as Record<string, unknown>)) {
      const v = value as { $rich?: { title?: string; content?: unknown } }
      blocks.push({
        id: key,
        title: v.$rich?.title,
        content: (v.$rich?.content ?? null) as unknown,
      });
    }
  });
  return blocks;
}
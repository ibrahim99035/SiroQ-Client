"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import BulletList from "@tiptap/extension-bullet-list";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Blockquote from "@tiptap/extension-blockquote";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";

interface ReportRichTextProps {
  content: unknown;
  title?: string;
}

export function ReportRichText({ content, title }: ReportRichTextProps) {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      Underline,
      Strike,
      Link.configure({ openOnClick: false, autolink: true }),
      ListItem,
      OrderedList,
      BulletList,
      TaskList,
      TaskItem,
      Blockquote,
      Code,
      CodeBlock,
      HorizontalRule,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Color,
      TextStyle,
      Highlight,
    ],
    content: content as never,
    editable: false,
    immediatelyRender: false,
  });

  return (
    <div className="px-5 pb-3">
      {title ? (
        <p className="mb-2 truncate text-[13px] font-medium text-ink" title={title}>
          {title}
        </p>
      ) : null}
      <EditorContent editor={editor} className="prose prose-sm max-w-none [&_.ProseMirror]:text-[12px] [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-ink [&_.ProseMirror_p]:my-1.5 [&_.ProseMirror_h1]:mt-2 [&_.ProseMirror_h1]:mb-1.5 [&_.ProseMirror_h2]:mt-2 [&_.ProseMirror_h2]:mb-1.5 [&_.ProseMirror_h3]:mt-1.5 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_ul]:my-1.5 [&_.ProseMirror_ol]:my-1.5 [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_hr]:my-2 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_table]:my-2" />
    </div>
  );
}

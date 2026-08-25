/**
 * Service for formatting workspace schemas into various output formats
 *
 * Uses Handlebars templates to transform WorkspaceSchema objects into:
 * - Claude Skills (SKILL.md + resources/)
 * - Plain Markdown (single file)
 * - JSON (machine-readable)
 *
 * @see Issue #983
 */

import Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { WorkspaceSchema, FormattedOutput } from './types.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service for formatting workspace schemas into various output formats
 */
export class SchemaFormatterService {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private helpersRegistered = false;

  constructor() {
    this.registerHelpers();
  }

  /**
   * Formats schema to specified output format
   *
   * @param schema - Complete workspace schema
   * @param format - Output format (skill, markdown, json)
   * @returns Formatted output ready for writing
   */
  async format(
    schema: WorkspaceSchema,
    format: 'skill' | 'markdown' | 'json'
  ): Promise<FormattedOutput> {
    switch (format) {
      case 'skill':
        return this.formatAsSkill(schema);
      case 'markdown':
        return this.formatAsMarkdown(schema);
      case 'json':
        return this.formatAsJSON(schema);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Formats as Claude Skill with SKILL.md + resources/
   *
   * @param schema - Workspace schema
   * @returns Skill files ready for writing
   */
  private async formatAsSkill(
    schema: WorkspaceSchema
  ): Promise<FormattedOutput> {
    const skillMd = await this.renderTemplate(
      'SKILL.template.md',
      this.buildSkillIndexView(schema)
    );

    // Validate Claude Skill description length requirement (≤200 chars)
    const descMatch = skillMd.match(/^description:\s*(.+)$/m);
    if (descMatch && descMatch[1].length > 200) {
      throw new Error(
        `Skill description exceeds 200 characters (${descMatch[1].length} chars). ` +
          `Claude Skills require descriptions ≤200 chars. ` +
          `Try reducing the number of objects or simplifying the description.`
      );
    }

    // Validate Claude Skill name length requirement (≤64 chars)
    const nameMatch = skillMd.match(/^name:\s*(.+)$/m);
    if (nameMatch && nameMatch[1].trim().length > 64) {
      throw new Error(
        `Skill name exceeds 64 characters (${nameMatch[1].trim().length} chars). ` +
          `Claude Skills require names ≤64 chars.`
      );
    }

    // Generate per-object attribute files for progressive disclosure
    // This enables Claude to load only the object it's working with (~2k tokens)
    // instead of the entire monolithic file (~10k tokens)
    // @see Issue #1014
    const attributeFiles: Record<string, string> = {};

    for (const obj of schema.objects) {
      const objectSchema = { ...schema, objects: [obj] };
      const attrMd = await this.renderTemplate(
        'attribute-reference.template.md',
        objectSchema
      );
      attributeFiles[`resources/${obj.objectSlug}-attributes.md`] = attrMd;
    }

    const complexTypes = await this.renderTemplate(
      'complex-types.template.md',
      schema
    );

    // Render the lists reference when list discovery produced results
    const listFiles: Record<string, string> = {};
    if (schema.lists && schema.lists.length > 0) {
      listFiles['resources/lists.md'] = await this.renderTemplate(
        'lists.template.md',
        schema
      );
    }

    return {
      format: 'skill',
      files: {
        'SKILL.md': skillMd,
        ...attributeFiles,
        ...listFiles,
        'resources/complex-types.md': complexTypes,
      },
    };
  }

  /**
   * Builds the view model for the SKILL.md index: each object is annotated
   * with attribute counts so the index communicates per-file weight without
   * the reader opening it.
   */
  private buildSkillIndexView(
    schema: WorkspaceSchema
  ): Record<string, unknown> {
    return {
      ...schema,
      objects: schema.objects.map((obj) => ({
        ...obj,
        attributeCount: obj.attributes.length,
        optionAttributeCount: obj.attributes.filter(
          (attr) => attr.options && attr.options.length > 0
        ).length,
      })),
    };
  }

  /**
   * Formats as single markdown file (all-in-one)
   *
   * @param schema - Workspace schema
   * @returns Single markdown file
   */
  private async formatAsMarkdown(
    schema: WorkspaceSchema
  ): Promise<FormattedOutput> {
    // Render all templates and combine them
    const skillMd = await this.renderTemplate(
      'SKILL.template.md',
      this.buildSkillIndexView(schema)
    );
    const attrRef = await this.renderTemplate(
      'attribute-reference.template.md',
      schema
    );
    const complexTypes = await this.renderTemplate(
      'complex-types.template.md',
      schema
    );
    const listsMd =
      schema.lists && schema.lists.length > 0
        ? await this.renderTemplate('lists.template.md', schema)
        : null;

    // Combine into single document
    const combined = [
      skillMd,
      attrRef,
      ...(listsMd ? [listsMd] : []),
      complexTypes,
    ].join('\n\n---\n\n');

    return {
      format: 'markdown',
      files: {
        'attio-workspace-schema.md': combined,
      },
    };
  }

  /**
   * Formats as JSON (machine-readable)
   *
   * @param schema - Workspace schema
   * @returns JSON representation
   */
  private formatAsJSON(schema: WorkspaceSchema): FormattedOutput {
    return {
      format: 'json',
      files: {
        'attio-workspace-schema.json': JSON.stringify(schema, null, 2),
      },
    };
  }

  /**
   * Renders a template with the given data
   *
   * @param templateName - Template filename
   * @param data - Data to pass to template
   * @returns Rendered template string
   */
  private async renderTemplate(
    templateName: string,
    data: WorkspaceSchema | Record<string, unknown>
  ): Promise<string> {
    // Check cache first
    if (!this.templates.has(templateName)) {
      // Load and compile template
      const templatePath = path.join(
        __dirname,
        '../../templates/skill',
        templateName
      );

      try {
        const templateSource = await fs.readFile(templatePath, 'utf8');
        const compiledTemplate = Handlebars.compile(templateSource);
        this.templates.set(templateName, compiledTemplate);
      } catch (error: unknown) {
        throw new Error(
          `Failed to load template ${templateName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error }
        );
      }
    }

    // Render template
    const template = this.templates.get(templateName)!;
    return template(data);
  }

  /**
   * Registers custom Handlebars helpers
   */
  private registerHelpers(): void {
    if (this.helpersRegistered) {
      return;
    }

    // Helper: Display checkmark or X for boolean values
    Handlebars.registerHelper('checkmark', (value: boolean) => {
      return value ? '✓' : '✗';
    });

    // Helper: Subtract two numbers
    Handlebars.registerHelper('subtract', (a: number, b: number) => {
      return a - b;
    });

    // Helper: JSON stringify with formatting
    Handlebars.registerHelper('json', (obj: unknown) => {
      return JSON.stringify(obj, null, 2);
    });

    // Helper: distinguish "absent" from "empty array" (Handlebars #if
    // treats both as falsy; record-reference targets need the difference)
    Handlebars.registerHelper('isDefined', (value: unknown) => {
      return value !== undefined && value !== null;
    });

    this.helpersRegistered = true;
  }
}

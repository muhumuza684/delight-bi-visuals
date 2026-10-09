import powerbi from "powerbi-visuals-api";
import { BaseVisual } from "./core/baseVisual";
import { VisualSpec } from "./core/spec";
import { Sample } from "./core/sample";
import spec from "./spec.json";
import sample from "./sample.json";
import { InsightExplorerRenderer } from "./renderer";
import "../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;

export class InsightExplorer extends BaseVisual {
    constructor(options: VisualConstructorOptions) {
        super(options, spec as unknown as VisualSpec, () => new InsightExplorerRenderer(), sample as unknown as Sample);
    }
}

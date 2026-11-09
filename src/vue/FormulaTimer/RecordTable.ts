import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { FormulaRecord } from '../../ble/formula-timer';
import { recordTps } from '../../ble/formula-timer-stats';

@Component({template:require('./RecordTable.html')})
export default class RecordTable extends Vue {
  @Prop({required:true}) records: FormulaRecord[];
  page = 1;

  get pageCount(): number { return Math.max(1, Math.ceil(this.records.length / 50)); }
  get pageRecords(): FormulaRecord[] { return this.records.slice((this.page - 1) * 50, this.page * 50); }
  @Watch('records')
  resetPage(): void { this.page = 1; }

  formatReaction(record: FormulaRecord): string {
    return record.reactionMs === undefined ? '—' : (record.reactionMs / 1000).toFixed(2);
  }
  formatTps(record: FormulaRecord): string {
    const tps = recordTps(record);
    return tps === null ? '—' : tps.toFixed(2);
  }
}

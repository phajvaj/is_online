import { Knex } from 'knex';
const dbName = process.env.HIS_DB_NAME;
const dbType = process.env.HIS_DB_CLIENT;
const maxLimit = 500;

export class HisHosxpv4Model {
    getTableName(knex: Knex) {
        return knex('information_schema.tables')
            .select('table_name')
            .where('table_catalog', '=', dbName);

    }

    testConnect(db: Knex) {
        return db('patient').select('hn').limit(1)
    }

    getPerson(db: Knex, columnName: string, searchText: any) {
        let sql = db('patient');
        if (typeof searchText === 'string'){
            sql.where(columnName, searchText);
        } else {
            sql.whereIn(columnName, searchText);
        }
        return sql.leftJoin('nationality as nt1','patient.nationality','nt1.nationality')
            .leftJoin(`occupation`, 'occupation.occupation', 'patient.occupation')
            .select('patient.hn', 'patient.cid', 'patient.pname as prename',
                'patient.fname', 'patient.lname', 'patient.occupation as occupa',
                'occupation.nhso_code as occupation', 'patient.nationality',
                'patient.birthday as dob', 'patient.sex', 'patient.moopart as moo', 'patient.road',
                'patient.addrpart as address', 'patient.hometel as tel', 'patient.po_code as zip',
                'nt1.nhso_code as nation',
                db.raw('CONCAT(chwpart,amppart,tmbpart) as addcode'))
            .limit(maxLimit);
    }
    getOpdService(db: Knex, hn, date, columnName = '', searchText = '') {
        columnName = columnName == 'visitNo' || columnName == 'vn' ? 'opdscreen.vn' : columnName;
        columnName = columnName == 'hn' ? 'opdscreen.hn' : columnName;
        let where: any = {};
        if (hn) where['opdscreen.hn'] = hn;
        if (date) where['opdscreen.vstdate'] = date;
        if (columnName && searchText) where[columnName] = searchText;
        const sql = db('opdscreen')
            .leftJoin(`ovst`, 'ovst.vn', 'opdscreen.vn')
            .leftJoin(`patient`, 'patient.hn', 'opdscreen.hn')
            .leftJoin(`er_regist`, 'er_regist.vn', 'ovst.vn')
            .leftJoin(`er_nursing_detail`, 'er_nursing_detail.vn', 'opdscreen.vn')
            .leftJoin(`er_emergency_type`, `er_emergency_type.er_emergency_type`, `er_regist.er_emergency_type`)
            .leftJoin(`accident_transport_type`, 'er_nursing_detail.accident_transport_type_id', 'accident_transport_type.accident_transport_type_id')
            .leftJoin(`clinic`, 'ovst.cur_dep', 'clinic.clinic')
            .select('opdscreen.hn', 'opdscreen.vn as visitno', 'opdscreen.vstdate as date',
                'opdscreen.vsttime as time',
                'ovst.cur_dep as clinic_local_code', 'clinic.name as clinic_local_name',
                'opdscreen.bps as bp_systolic', 'opdscreen.bpd as bp_diastolic',
                'opdscreen.pulse as pr', 'opdscreen.rr', 'ovst.vstdate as hdate', 'ovst.vsttime as htime',
                'er_nursing_detail.gcs_e as eye', 'er_nursing_detail.gcs_v as verbal',
                'er_nursing_detail.gcs_m as motor',
                'er_nursing_detail.er_accident_type_id as cause',
                'accident_transport_type.export_code as injt',
                'er_nursing_detail.accident_person_type_id as injp',
                'er_nursing_detail.accident_airway_type_id as airway',
                'er_nursing_detail.accident_alcohol_type_id as risk1',
                'er_nursing_detail.accident_drug_type_id as risk2',
                'er_nursing_detail.accident_belt_type_id as risk3',
                'er_nursing_detail.accident_helmet_type_id as risk4',
                'er_nursing_detail.accident_bleed_type_id as blood',
                'er_nursing_detail.accident_splint_type_id as splintc',
                'er_nursing_detail.accident_fluid_type_id as iv',
                'er_nursing_detail.accident_type_1 as br1',
                'er_nursing_detail.accident_type_2 as br2',
                'er_nursing_detail.accident_type_3 as tinj',
                'er_nursing_detail.accident_type_4 as ais1',
                'er_nursing_detail.accident_type_5 as ais2',
                'er_nursing_detail.accident_place_type_id as apoint',
                'er_nursing_detail.accident_place as apointname',
                'er_regist.finish_time as disc_date_er',
                'er_emergency_type.export_code as cause_t'
            )
            .where(where);
            if(dbType === 'mysql')
                sql.groupBy('ovst.vn');
        return sql.limit(maxLimit);
    }
    getOpdServiceByVN(db: Knex, vn: any) {
        let sql = db('opdscreen');
        if (typeof vn === 'string') {
            sql.where('opdscreen.vn', vn);
        } else {
            sql.whereIn('opdscreen.vn', vn)
        };

        return sql.leftJoin(`ovst`, 'ovst.vn', 'opdscreen.vn')
            .leftJoin(`patient`, 'patient.hn', 'opdscreen.hn')
            .leftJoin(`er_regist`, 'er_regist.vn', 'ovst.vn')
            .leftJoin(`er_nursing_detail`, 'er_nursing_detail.vn', 'opdscreen.vn')
            .leftJoin(`ovstdiag`, 'ovstdiag.vn', 'opdscreen.vn')
            .leftJoin(`ipt`, 'ipt.vn', 'opdscreen.vn')
            .leftJoin(`referin`, 'referin.vn', 'opdscreen.vn')
            .leftJoin(`clinic`, 'ovst.cur_dep', 'clinic.clinic')
            .select('opdscreen.hn', 'opdscreen.vn as visitno', 'opdscreen.vstdate as date',
                'opdscreen.vsttime as time',
                'ovst.cur_dep as clinic_local_code', 'clinic.name as clinic_local_name',
                'opdscreen.bps as bp_systolic', 'opdscreen.bpd as bp_diastolic',
                'opdscreen.pulse as pr', 'opdscreen.rr', 'ovst.vstdate as hdate', 'ovst.vsttime as htime',
                'er_nursing_detail.gcs_e as eye', 'er_nursing_detail.gcs_v as verbal',
                'er_nursing_detail.gcs_m as motor',
                'er_nursing_detail.er_accident_type_id as cause',
                'er_nursing_detail.accident_place_type_id as apoint',
                'er_nursing_detail.accident_transport_type_id as injt',
                'er_nursing_detail.accident_person_type_id as injp',
                'er_nursing_detail.accident_airway_type_id as airway',
                'er_nursing_detail.accident_alcohol_type_id as risk1',
                'er_nursing_detail.accident_drug_type_id as risk2',
                'er_nursing_detail.accident_belt_type_id as risk3',
                'er_nursing_detail.accident_helmet_type_id as risk4',
                'er_nursing_detail.accident_bleed_type_id as blood',
                'er_nursing_detail.accident_splint_type_id as splintc',
                'er_nursing_detail.accident_fluid_type_id as iv',
                'er_nursing_detail.accident_type_1 as br1',
                'er_nursing_detail.accident_type_2 as br2',
                'er_nursing_detail.accident_type_3 as tinj',
                'er_nursing_detail.accident_type_4 as ais1',
                'er_nursing_detail.accident_type_5 as ais2',
                'er_regist.finish_time as disc_date_er',
                'er_regist.er_emergency_type as cause_t',
                'ipt.ward as wardcode',
                'referin.refer_hospcode as htohosp'
            )
            .select(db.raw('case when ovstdiag.diagtype = 1 then ovstdiag.icd10 else null end as diag1'))
            .select(db.raw('case when ovstdiag.diagtype = 2 then ovstdiag.icd10 else null end as diag2'))
            .limit(maxLimit);
    }

    getDiagnosisOpd(db: Knex, visitno) {
        return db('ovstdiag')
            .select('hn', 'vn as visitno', 'icd10 as diagcode'
                , 'diagtype as diag_type'
                , 'update_datetime as d_update')
            .select(db.raw(`concat(vstdate,' ',vsttime) as date_serv`))
            .where('vn', "=", visitno);
    }
    async getDiagnosisOpdVWXY(db: Knex, date: any) {
        let sql = `SELECT hn, vn AS visitno, dx.vstdate as date, icd10 AS diagcode
                , icd.name AS diag_name
                , dx.diagtype AS diag_type, doctor AS dr
                , dx.episode
                , "IT" as codeset, update_datetime as d_update
            FROM ovstdiag as dx
                LEFT JOIN icd10_sss as icd ON dx.icd10 = icd.code
            WHERE vn IN (
                SELECT vn FROM ovstdiag as dx
                WHERE dx.vstdate= ? AND LEFT(icd10,1) IN ('V','W','X','Y'))
                AND LEFT(icd10,1) IN ('S','T','V','W','X','Y')
            ORDER BY vn, diagtype, update_datetime LIMIT `+maxLimit;

        const result = await db.raw(sql, [date]);
        return result[0];
    }

    getProcedureOpd(knex, columnName, searchNo, hospCode) {
        return knex('procedure_opd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getChargeOpd(knex, columnName, searchNo, hospCode) {
        return knex('charge_opd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getDrugOpd(knex, columnName, searchNo, hospCode) {
        return knex('drug_opd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getAdmission(knex, columnName, searchNo, hospCode) {
        return knex('admission')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getDiagnosisIpd(knex, columnName, searchNo, hospCode) {
        return knex('diagnosis_ipd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getProcedureIpd(knex, columnName, searchNo, hospCode) {
        return knex('procedure_ipd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getChargeIpd(knex, columnName, searchNo, hospCode) {
        return knex('charge_ipd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getDrugIpd(knex, columnName, searchNo, hospCode) {
        return knex('drug_ipd')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getAccident(knex, visitno) {
        return knex('er_regist')
            .select('er_regist.vn', 'ovst.hn', 'ovst.vstdate as adate',
                'ovst.vsttime as atime', 'er_nursing_detail.accident_person_type_id',
                'er_nursing_detail.accident_belt_type_id as belt',
                'opdscreen.bps as bp1', 'opdscreen.bpd as bp2',
                'er_nursing_detail.gcs_e as e', 'er_nursing_detail.gcs_v as v', 'er_nursing_detail.gcs_m as m')
            .leftJoin(`ovst`, function () { this.on('ovst.vn', '=', 'er_regist.vn') })
            .leftJoin(`patient`, function () { this.on('patient.hn', '=', 'ovst.hn') })
            .leftJoin(`er_nursing_detail`, function () { this.on('er_nursing_detail.vn', '=', 'ovst.vn') })
            .leftJoin(`opdscreen`, function () { this.on('opdscreen.hn', '=', 'ovst.hn') })
            //.leftJoin('patient' on 'patient'.'hn' = 'ovst'.'hn')
            .where('er_regist.vn', "=", visitno);
        //         db('users').select('*').leftJoin('accounts', function() {
        //   this.on('accounts.id', '=', 'users.account_id').orOn('accounts.owner_id', '=', 'users.id')
        // })
    }

    getAppointment(knex, columnName, searchNo, hospCode) {
        return knex('appointment')
            .select('*')
            .where(columnName, "=", searchNo);
    }

    getData(knex, tableName, columnName, searchNo, hospCode) {
        return knex(tableName)
            .select('*')
            .where(columnName, "=", searchNo)
            .limit(5000);
    }
}

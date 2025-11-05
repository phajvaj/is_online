import { Knex } from "knex";
import * as moment from "moment";

const maxLimit = 250;
let hisHospcode = process.env.HOSPCODE;
const getHospcode = async () => {
    try {
        if (typeof global.dbHIS === "function") {
            let row = await global
                .dbHIS("opdconfig")
                .select("hospitalcode")
                .first();
            hisHospcode = row ? row.hospitalcode : process.env.HOSPCODE;
            console.log("hisHospcode v.4", hisHospcode);
        } else {
            console.error(
                "global.dbHIS is not a function. Using default HOSPCODE",
            );
        }
    } catch (error) {
        console.error("Error in getHospcode:", error);
        // Fallback to environment variable
        console.log("Using HOSPCODE from environment:", process.env.HOSPCODE);
    }
};
export class HisHosxpv4PgModel {
    constructor() {
        getHospcode();
    }

    check() {
        return true;
    }

    async testConnect(db: Knex) {
        let result: any;
        result = await global.dbHIS("opdconfig").first();
        const hospname = result?.hospitalname || result?.hospitalcode || null;

        result = await db("patient").select("hn").limit(1);
        const connection =
            result && (result.patient || result.length > 0) ? true : false;

        let charset: any = "";
        if (process.env.HIS_DB_CLIENT.toLowerCase().includes("mysql")) {
            result = await db("information_schema.SCHEMATA")
                .select("DEFAULT_CHARACTER_SET_NAME")
                .where("SCHEMA_NAME", process.env.HIS_DB_NAME)
                .first();
            charset = result?.DEFAULT_CHARACTER_SET_NAME || "";
        }
        return { hospname, connection, charset };
    }

    getTableName(db: Knex, dbName = process.env.HIS_DB_NAME) {
        return db("information_schema.tables")
            .select("table_name")
            .where("table_schema", "=", dbName);
    }

    // รหัสห้องตรวจ
    getDepartment(db: Knex, depCode: string = "", depName: string = "") {
        let sql = db("clinic");
        if (depCode) {
            sql.where("clinic", depCode);
        } else if (depName) {
            sql.whereLike("name", `%${depName}%`);
        }
        return sql
            .select(
                "clinic as department_code",
                "name as department_name",
                `'-' as moph_code`,
            )
            .select(db.raw(`CASE WHEN POSITION('ฉุกเฉิน' in name)>0 THEN 1 ELSE 0 END as emergency`))
            .orderBy("name")
            .limit(maxLimit);
    }

    // รหัส Ward
    getWard(db: Knex, wardCode: string = "", wardName: string = "") {
        let sql = db("ward");
        if (wardCode) {
            sql.where("ward", wardCode);
        } else if (wardName) {
            sql.whereLike("name", `%${wardName}%`);
        }
        return sql
            .select(
                "ward as wardcode",
                "name as wardname",
                `sss_code as std_code`,
                db.raw(`CASE WHEN spclty = 'Y' THEN 0 ELSE bedcount END as bed_normal`),
                db.raw(`CASE WHEN spclty = 'Y' THEN bedcount ELSE 0 END as bed_special`),
            )
            .orderBy("ward")
            .limit(maxLimit);
    }

    // รายละเอียดแพทย์
    getDr(db: Knex, drCode: string = "", drName: string = "") {
        let sql = db("doctor");
        if (drCode) {
            sql.where("code", drCode);
        } else if (drName) {
            sql.whereLike("name", `%${drName}%`);
        }
        return sql
            .select(
                "code as dr_code",
                "licenseno as dr_license_code",
                "name as dr_name",
                "expire as expire_date",
            )
            .whereRaw(`LEFT(licenseno,1) IN ('ว','ท')`)
            .limit(maxLimit);
    }

    //select รายชื่อเพื่อแสดงทะเบียน refer
    getReferOut(
        db: Knex,
        date: any,
        hospCode = hisHospcode,
        visitNo: string = null,
    ) {
        let sql = db("referout as r")
            .innerJoin("patient as pt", "pt.hn", "r.hn")
            .leftJoin("an_stat", "r.vn", "an_stat.vn")
            .leftJoin(
                "refer_vital_sign",
                "r.referout_id",
                "refer_vital_sign.referout_id",
            )
            .leftJoin("opdscreen", "r.vn", "opdscreen.vn")
            .leftJoin("doctor", "r.doctor", "doctor.code")
            .select(db.raw(`'${hisHospcode}' as hospcode`));
        if (visitNo) {
            sql.where("r.vn", visitNo);
        } else {
            sql.where("r.refer_date", date);
        }
        return sql
            .select(
                db.raw(`(r.refer_date || ' ' || r.refer_time) AS refer_date`),
                "r.refer_number AS referid",
                "r.refer_hospcode AS hosp_destination",
                "r.hn AS PID",
                "r.hn AS hn",
                "pt.cid AS CID",
                "r.vn",
                "r.vn as SEQ",
                "an_stat.an as AN",
                "pt.pname AS prename",
                "pt.fname AS fname",
                "pt.lname",
                "pt.birthday AS dob",
                "pt.sex",
                "r.referout_emergency_type_id as EMERGENCY",
                "r.doctor as dr",
                "doctor.licenseno as provider",
                "r.request_text as REQUEST",
                "r.pdx AS dx",
                "refer_vital_sign.cc",
                db.raw("CASE WHEN r.pmh IS NOT NULL AND r.pmh != '' THEN r.pmh ELSE opdscreen.pmh END as PH"),
                db.raw("CASE WHEN r.hpi IS NOT NULL AND r.hpi != '' THEN r.hpi ELSE opdscreen.hpi END as PI"),
                db.raw("CASE WHEN refer_vital_sign.pe IS NOT NULL AND refer_vital_sign.pe != '' THEN refer_vital_sign.pe ELSE r.treatment_text END as PHYSICALEXAM"),
                db.raw("CASE WHEN refer_vital_sign.pre_diagnosis IS NOT NULL AND refer_vital_sign.pre_diagnosis != '' THEN refer_vital_sign.pre_diagnosis ELSE r.pre_diagnosis END as diaglast"),
                db.raw("CASE WHEN (SELECT count(an) as cc from an_stat WHERE an = r.vn) = 1 THEN r.vn ELSE null END as an"),
                `r.accept_point as clinic`,
            )
            .whereNotNull("r.vn")
            .where("r.refer_hospcode", "!=", "")
            .whereNotNull("r.refer_hospcode")
            .where("r.refer_hospcode", "!=", hisHospcode)
            .groupBy(
                "r.referout_id", "r.refer_date", "r.refer_time", "r.refer_number",
                "r.refer_hospcode", "r.hn", "pt.cid", "r.vn", "an_stat.an",
                "pt.pname", "pt.fname", "pt.lname", "pt.birthday", "pt.sex",
                "r.referout_emergency_type_id", "r.doctor", "doctor.licenseno",
                "r.request_text", "r.pdx", "refer_vital_sign.cc", "r.pmh",
                "opdscreen.pmh", "r.hpi", "opdscreen.hpi", "refer_vital_sign.pe",
                "r.treatment_text", "refer_vital_sign.pre_diagnosis", "r.pre_diagnosis",
                "r.accept_point"
            ) // กรณี refer_vital_sign มีหลาย row
            .orderBy("r.refer_date");
    }

    async getPerson(db: Knex, columnName, searchText, hospCode = hisHospcode) {
        columnName = columnName == "hn" ? "p.hn" : columnName;
        columnName = columnName == "cid" ? "p.cid" : columnName;
        columnName = columnName == "name" ? "p.fname" : columnName;
        columnName = columnName == "hid" ? "h.house_id" : columnName;
        const sql = `
            SELECT '${hisHospcode}' as HOSPCODE
            ,h.house_id HID
            ,p.cid as CID
            ,p.pname as PRENAME
            ,p.fname as NAME
            ,p.lname as LNAME
            ,p.hn as HN
            ,p.hn as PID
            ,p.sex as SEX
            ,p.birthday as BIRTH
            ,CASE WHEN p.marrystatus in (1,2,3,4,5,6) THEN p.marrystatus ELSE '9' END as MSTATUS
            ,CASE WHEN person.person_house_position_id=1 THEN '1' ELSE '2' END FSTATUS
            ,CASE WHEN o.occupation IS NULL THEN '000' ELSE o.occupation END AS OCCUPATION_OLD
            ,CASE WHEN o.nhso_code IS NULL THEN '9999' ELSE o.nhso_code END AS OCCUPATION_NEW
            ,CASE WHEN nt0.nhso_code IS NULL THEN '099' ELSE nt0.nhso_code END AS RACE
            ,CASE WHEN nt1.nhso_code IS NULL THEN '099' ELSE nt1.nhso_code END AS NATION
            ,CASE WHEN p.religion IS NULL THEN '01' ELSE p.religion END AS RELIGION
            ,CASE WHEN e.provis_code is null THEN '9' ELSE e.provis_code END as EDUCATION
            ,p.father_cid as FATHER
            ,p.mother_cid as MOTHER
            ,p.couple_cid COUPLE
            ,(select case
                when (select person_duty_id from person_village_duty where person_id =p.cid) in ('1','2','4','5') then '1'
                when (select person_duty_id from person_village_duty where person_id =p.cid) in ('6') then '2'
                when (select person_duty_id from person_village_duty where person_id =p.cid) in ('3') then '3'
                when (select person_duty_id from person_village_duty where person_id =p.cid) in ('10') then '4'
                when (select person_duty_id from person_village_duty where person_id =p.cid) in ('7','8','9') then '5'
                else '5'
            end) VSTATUS
            ,person.movein_date MOVEIN
            ,CASE WHEN person.person_discharge_id IS NULL THEN '9' ELSE person.person_discharge_id END AS DISCHARGE
            ,person.discharge_date DDISCHARGE
            ,case
                when p.bloodgroup='A' then '1'
                when p.bloodgroup='B' then '2'
                when p.bloodgroup='AB' then '3'
                when p.bloodgroup='O' then '4'
                else '9'
            end ABOGROUP
            ,p.bloodgroup_rh as RHGROUP
            ,pl.nhso_code LABOR
            ,p.passport_no as PASSPORT
            ,p.type_area as TYPEAREA
            ,p.mobile_phone_number as MOBILE
            ,p.deathday as dead
            ,CASE WHEN p.last_update IS NULL THEN p.last_visit ELSE p.last_update END as D_UPDATE
        from patient as p
            left join person on p.hn=person.patient_hn
            left join house h on person.house_id=h.house_id
            left join occupation o on o.occupation=p.occupation
            left join nationality nt0 on nt0.nationality=p.citizenship
            left join nationality nt1 on nt1.nationality=p.nationality
            left join provis_religion r on r.code=p.religion
            left join education e on e.education=p.educate
            left join person_labor_type pl on person.person_labor_type_id=pl.person_labor_type_id
            where ${columnName}=$1
        `;
        const result = await db.raw(sql, [searchText]);
        return result.rows;
    }

    async getAddress(db: Knex, columnName, searchText, hospCode = hisHospcode) {
        //columnName => hn
        const sql = `
            SELECT
                '${hisHospcode}' AS hospcode,
                pt.cid,
                pt.hn, pt.hn as pid,
                CASE WHEN p.house_regist_type_id IN (1, 2) THEN '1' ELSE '2' END addresstype,
                CASE WHEN h.census_id IS NULL THEN '' ELSE h.census_id END AS house_id,
                CASE WHEN p.house_regist_type_id IN (4) THEN '9' ELSE h.house_type_id END housetype,
                h.house_condo_roomno roomno,
                h.house_condo_name condo,
                CASE WHEN p.house_regist_type_id IN (4) THEN pt.addrpart ELSE h.address END houseno,
                '' soisub,
                '' soimain,
                CASE WHEN p.house_regist_type_id IN (4) THEN pt.road ELSE h.road END road,
                CASE WHEN p.house_regist_type_id IN (4) THEN '' ELSE v.village_name END villaname,
                CASE WHEN p.house_regist_type_id IN (4) THEN pt.moopart ELSE v.village_moo END village,
                CASE WHEN p.house_regist_type_id IN (4) THEN pt.tmbpart ELSE t.tmbpart END tambon,
                CASE WHEN p.house_regist_type_id IN (4) THEN pt.amppart ELSE t.amppart END ampur,
                CASE WHEN p.house_regist_type_id IN (4) THEN pt.chwpart ELSE t.chwpart END changwat,
                p.last_update D_Update
            FROM
                person p
                LEFT JOIN patient pt ON p.cid = pt.cid
                LEFT JOIN house h ON h.house_id = p.house_id
                LEFT JOIN village v ON v.village_id = h.village_id
                LEFT JOIN thaiaddress t ON t.addressid=v.address_id
                LEFT JOIN person_address pa ON pa.person_id = p.person_id

            where ${columnName}=$1
        `;
        const result = await db.raw(sql, [searchText]);
        return result.rows;
    }
    async getService(db: Knex, columnName, searchText, hospCode = hisHospcode) {
        //columnName = visitNo, hn
        columnName = columnName === "visitNo" ? "os.vn" : columnName;
        columnName = columnName === "vn" ? "os.vn" : columnName;
        columnName = columnName === "seq_id" ? "os.seq_id" : columnName;
        columnName = columnName === "hn" ? "o.hn" : columnName;
        columnName = columnName === "date_serv" ? "o.vstdate" : columnName;
        const sql = `
            select
                '${hisHospcode}' as HOSPCODE,
                pt.hn as PID, o.hn as HN, pt.CID, os.seq_id, os.vn as SEQ,
                CASE 
                    WHEN o.vstdate is null
                        or trim(o.vstdate::text)=''
                        or o.vstdate::text like '0000-00-00%'
                    THEN ''
                    ELSE to_char(o.vstdate,'YYYY-MM-DD')
                END as DATE_SERV,
                CASE 
                    WHEN o.vsttime is null
                        or trim(o.vsttime::text)=''
                        or o.vsttime::text like '0000-00-00%'
                    THEN ''
                    ELSE to_char(o.vsttime,'HH24MISS')
                END as TIME_SERV,
                CASE WHEN v.village_moo <>'0' THEN '1' ELSE '2' END as LOCATION,
                (select case  o.visit_type
                    when 'i'  then '1'
                    when 'o' then '2'
                    else '1' end) as INTIME,
                CASE WHEN p2.pttype_std_code is null or p2.pttype_std_code ='' THEN '9100' ELSE p2.pttype_std_code END as INSTYPE,
                o.hospmain as MAIN,
                (select case o.pt_subtype
                    when '7' then '2'
                    when '9' then '3'
                    when '10' then '4'
                else '1' end) as TYPEIN,
                CASE WHEN o.rfrolct IS NULL THEN i.rfrolct ELSE o.rfrolct END as REFEROUTHOSP,
                CASE WHEN o.rfrocs IS NULL THEN i.rfrocs ELSE o.rfrocs END as CAUSEOUT,
                s.waist, s.cc, s.pe, s.pmh as ph, s.hpi as pi,
                ('CC:' || COALESCE(s.cc,'') || ' HPI:' || COALESCE(s.hpi,'') || ' PMH:' || COALESCE(s.pmh,'')) as nurse_note,
                CASE WHEN o.pt_subtype in('0','1') THEN '1' ELSE '2' END as SERVPLACE,
                CASE WHEN s.temperature IS NOT NULL THEN REPLACE(ROUND(s.temperature,1)::text,',','') ELSE '0.0' END as BTEMP,
                ROUND(COALESCE(s.bps,0),0) as SBP,
                ROUND(COALESCE(s.bpd,0),0) as DBP,
                ROUND(COALESCE(s.pulse,0),0) as PR,
                ROUND(COALESCE(s.rr,0),0) as RR,
                s.o2sat, s.bw as weight, s.height,
                'er.gcs_e', 'er.gcs_v',
                'er.gcs_m', 'er.pupil_l as pupil_left', 'er.pupil_r as pupil_right',
                (select case
                    when (o.ovstost >='01' and o.ovstost <='14') then '2'
                    when o.ovstost in ('98','99','61','62','63','00') then '1'
                    when o.ovstost = '54' then '3' when o.ovstost = '52' then '4'
                else '7' end) as TYPEOUT,
                CASE WHEN o.rfrolct IS NULL THEN i.rfrolct ELSE o.rfrolct END as REFEROUTHOSP,
                o.doctor as dr, doctor.licenseno as provider,
                CASE WHEN o.rfrocs IS NULL THEN i.rfrocs ELSE o.rfrocs END as CAUSEOUT,
                CASE WHEN vn.inc01 + vn.inc12 IS NOT NULL THEN REPLACE(ROUND(vn.inc01 + vn.inc12,2)::text,',','') ELSE '0.00' END as COST,
                CASE WHEN vn.item_money IS NOT NULL THEN REPLACE(ROUND(vn.item_money,2)::text,',','') ELSE '0.00' END as PRICE,
                CASE WHEN vn.paid_money IS NOT NULL THEN REPLACE(ROUND(vn.paid_money,2)::text,',','') ELSE '0.00' END as PAYPRICE,
                CASE WHEN vn.rcpt_money IS NOT NULL THEN REPLACE(ROUND(vn.rcpt_money,2)::text,',','') ELSE '0.00' END as ACTUALPAY,
                CASE 
                    WHEN (o.vstdate::text || ' ' || o.vsttime::text) is null
                        or trim(o.vstdate::text || ' ' || o.vsttime::text)=''
                        or (o.vstdate::text || ' ' || o.vsttime::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as D_UPDATE,
                vn.hospsub as hsub
            from
                ovst o
                left join person p on o.hn=p.patient_hn
                left join vn_stat vn on o.vn=vn.vn and vn.hn=p.patient_hn
                left join ipt as i on i.vn=o.vn
                left join opdscreen s on o.vn = s.vn and o.hn = s.hn
                left join pttype p2 on p2.pttype = vn.pttype
                left join village v on v.village_id = p.village_id
                left join patient pt on pt.hn = o.hn
                left join ovst_seq os on os.vn = o.vn
                left join doctor on o.doctor = doctor.code
                LEFT JOIN er_nursing_detail as er ON er.vn = o.vn
            where ${columnName}=$1
            `;

        // ควรใช้ v/s PH,PI,PE จาก referout, refer_vital_sign, opdscreen
        const result = await db.raw(sql, [searchText]);
        return result.rows;
    }

    async getDiagnosisOpd(db: Knex, visitNo, hospCode = hisHospcode) {
        const sql = `
            SELECT '${hisHospcode}' AS HOSPCODE,
                pt.cid CID,
                o.hn PID,
                o.hn,
                q.seq_id, q.vn SEQ, q.vn as VN,
                o.vstdate DATE_SERV,
                CASE WHEN odx.diagtype IS NULL THEN '' ELSE odx.diagtype END AS DIAGTYPE,
                odx.icd10 DIAGCODE,
                CASE WHEN s.provis_code IS NULL THEN '' ELSE s.provis_code END AS CLINIC,
                d.CODE PROVIDER,
                q.update_datetime D_UPDATE
            FROM
                ovst o
            LEFT JOIN ovst_seq q ON q.vn = o.vn
            LEFT JOIN ovstdiag odx ON odx.vn = o.vn
            LEFT JOIN patient pt ON pt.hn = o.hn
            LEFT JOIN person p ON p.patient_hn = pt.hn
            LEFT JOIN spclty s ON s.spclty = o.spclty
            LEFT JOIN doctor d ON d. CODE = o.doctor
            WHERE q.vn =$1 AND odx.icd10 ~ '[A-Z]'
            `;
        const result = await db.raw(sql, [visitNo]);
        return result.rows;
    }
    async getDiagnosisOpdAccident(
        db: Knex,
        dateStart: any,
        dateEnd: any,
        hospCode = hisHospcode,
    ) {
        if (dateStart & dateEnd) {
            return db("ovstdiag as dx")
                .whereBetween("vstdate", [dateStart, dateEnd])
                .whereRaw(`substring(icd10,1,1) in ('V','W','X','Y')`)
                .limit(maxLimit);
        } else {
            throw new Error("Invalid parameters");
        }
    }
    async getDiagnosisOpdVWXY(db: Knex, date: any) {
        let sql =
            `SELECT hn, vn AS visitno, dx.vstdate as date, icd10 AS diagcode
                , icd.name AS diag_name
                , dx.diagtype AS diag_type, doctor AS dr
                , dx.episode
                , 'IT' as codeset, update_datetime as d_update
            FROM ovstdiag as dx
                LEFT JOIN icd10_sss as icd ON dx.icd10 = icd.code
            WHERE vn IN (
                SELECT vn FROM ovstdiag as dx
                WHERE dx.vstdate= $1 AND SUBSTRING(icd10,1,1) IN ('V','W','X','Y'))
                AND SUBSTRING(icd10,1,1) IN ('S','T','V','W','X','Y')
            ORDER BY dx.vn, diagtype, update_datetime LIMIT ` + maxLimit;

        const result = await db.raw(sql, [date]);
        return result.rows;
    }
    async getDiagnosisSepsisOpd(db: Knex, date: any) {
        let sql =
            `SELECT hn, vn AS visitno, dx.vstdate as date, icd10 AS diagcode
                , icd.name AS diag_name
                , dx.diagtype AS diag_type, doctor AS dr
                , dx.episode
                , 'IT' as codeset, update_datetime as d_update
            FROM ovstdiag as dx
                LEFT JOIN icd10_sss as icd ON dx.icd10 = icd.code
            WHERE vn IN (
                SELECT vn FROM ovstdiag as dx
                WHERE dx.vstdate= $1 AND (SUBSTRING(icd10,1,4) IN ('R651','R572') OR SUBSTRING(diag,1,3) IN ('A40','A41')) GROUP BY dx.vn)
            ORDER BY dx.vn, diagtype, update_datetime LIMIT ` + maxLimit;

        const result = await db.raw(sql, [date]);
        return result.rows;
    }
    async getDiagnosisSepsisIpd(db: Knex, dateStart: any, dateEnd: any) {
        let sql =
            `SELECT ipt.hn, ipt.vn AS visitno, dx.an, ipt.dchdate as date
                , dx.icd10 AS diagcode
                , icd.name AS diag_name
                , dx.diagtype AS diag_type, dx.doctor AS dr
                , patient.pname AS patient_prename
                , patient.fname AS patient_fname
                , patient.lname AS patient_lname
                , ipt.ward as wardcode, ward.name as wardname
                , 'IT' as codeset, dx.entry_datetime as d_update
            FROM iptdiag as dx
                LEFT JOIN icd10_sss as icd ON dx.icd10 = icd.code
                LEFT JOIN ipt on dx.an=ipt.an
                LEFT JOIN patient on ipt.hn=patient.hn
                LEFT JOIN ward on ipt.ward=ward.ward
                WHERE dx.an IN (
                SELECT dx.an FROM iptdiag as dx LEFT JOIN ipt on dx.an=ipt.an
                WHERE ipt.dchdate BETWEEN $1 AND $2 AND (SUBSTRING(icd10,1,4) IN ('R651','R572') OR SUBSTRING(diag,1,3) IN ('A40','A41')) GROUP BY dx.an)
            ORDER BY dx.an, diagtype, ipt.update_datetime LIMIT ` + maxLimit;

        const result = await db.raw(sql, [dateStart, dateEnd]);
        return result.rows;
    }

    async getProcedureOpd(db: Knex, visitNo, hospCode = hisHospcode) {
        const sql = `
            select
                $1 as hospcode,
                pt.hn as pid,
                os.seq_id, os.vn as seq, os.vn,
                CASE WHEN o.vstdate is null or trim(o.vstdate::text)='' or o.vstdate::text like '0000-00-00%' THEN '' ELSE to_char(o.vstdate,'YYYY-MM-DD') END as date_serv,
                sp.provis_code as clinic,
                h3.icd10tm as procedcode,
                CASE WHEN h2.service_price is not null and trim(h2.service_price::text)<>'' THEN REPLACE(ROUND(h2.service_price,2)::text,',','') ELSE '0.00' END as serviceprice,
                h1.health_med_doctor_id as provider,
                CASE 
                    WHEN (o.vstdate::text || ' ' || o.vsttime::text) is null
                        or trim(o.vstdate::text || ' ' || o.vsttime::text)=''
                        or (o.vstdate::text || ' ' || o.vsttime::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as d_update
            from
                health_med_service h1
                left outer join health_med_service_operation h2 on h2.health_med_service_id = h1.health_med_service_id
                left outer join health_med_operation_item h3 on h3.health_med_operation_item_id = h2.health_med_operation_item_id
                left outer join health_med_organ g1 on g1.health_med_organ_id = h2.health_med_organ_id
                left outer join health_med_operation_type t1 on t1.health_med_operation_type_id = h2.health_med_operation_type_id
                left outer join ovst o on o.vn = h1.vn and h1.hn=o.hn
                left outer join vn_stat v on v.vn = h1.vn and h1.hn=v.hn
                left outer join person p on p.patient_hn=o.hn
                left outer join spclty sp on sp.spclty = o.spclty
                left join patient pt on pt.hn = o.hn
                left join ovst_seq os on os.vn = o.vn
            where
                h3.icd10tm  is not null
                and v.cid is not null
                and v.cid <>''
                and os.vn=$2

            union all

            select distinct
                $3 as hospcode,
                pt.hn as pid,
                os.seq_id, os.vn as seq, os.vn,
                CASE WHEN o.vstdate is null or trim(o.vstdate::text)='' or o.vstdate::text like '0000-00-00%' THEN '' ELSE to_char(o.vstdate,'YYYY-MM-DD') END as date_serv,
                sp.provis_code as clinic,
                CASE WHEN e.icd10tm is null or e.icd10tm = '' THEN e.icd9cm ELSE e.icd10tm END as procedcode,
                CASE WHEN e.price is not null and trim(e.price::text)<>'' THEN REPLACE(ROUND(e.price,2)::text,',','') ELSE '0.00' END as serviceprice,
                r.doctor as provider,
                CASE 
                    WHEN (o.vstdate::text || ' ' || o.vsttime::text) is null
                        or trim(o.vstdate::text || ' ' || o.vsttime::text)=''
                        or (o.vstdate::text || ' ' || o.vsttime::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as d_update
            from
                er_regist_oper r
                left outer join er_oper_code e on e.er_oper_code=r.er_oper_code
                left outer join vn_stat v on v.vn=r.vn
                left outer join ovst o on o.vn=r.vn
                left outer join person p on p.patient_hn=o.hn
                left outer join spclty sp on sp.spclty = o.spclty
                left join patient pt on pt.hn = o.hn
                left join ovst_seq os on os.vn = o.vn
            where
                e.icd9cm <>''
                and v.cid is not null
                and v.cid <>''
                and os.vn=$4

            union all

            select distinct
                $5 as hospcode,
                pt.hn as pid,
                os.seq_id, os.vn as seq, os.vn,
                CASE WHEN r.vstdate is null or trim(r.vstdate::text)='' or r.vstdate::text like '0000-00-00%' THEN '' ELSE to_char(r.vstdate,'YYYY-MM-DD') END as date_serv,
                sp.provis_code as clinic,
                CASE WHEN e.icd10tm_operation_code is null or e.icd10tm_operation_code = '' THEN e.icd9cm ELSE e.icd10tm_operation_code END as procedcode,
                CASE WHEN r.fee is not null and trim(r.fee::text)<>'' THEN REPLACE(ROUND(r.fee,2)::text,',','') ELSE '0.00' END as serviceprice,
                r.doctor as provider,
                CASE 
                    WHEN (o.vstdate::text || ' ' || o.vsttime::text) is null
                        or trim(o.vstdate::text || ' ' || o.vsttime::text)=''
                        or (o.vstdate::text || ' ' || o.vsttime::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as d_update
            from
                dtmain r
                left outer join person p on p.patient_hn=r.hn
                left outer join dttm e on e.icd9cm=r.icd9
                left outer join vn_stat v on v.vn=r.vn and v.hn=r.hn
                left outer join ovst o on o.vn=r.vn and o.hn=r.hn
                left outer join spclty sp on sp.spclty = o.spclty
                left join patient pt on pt.hn = o.hn
                left join ovst_seq os on os.vn = o.vn
            where
                v.cid is not null
                and v.cid <>''
                and e.icd10tm_operation_code is not null
                and os.vn=$6
            `;
        const result = await db.raw(sql, [
            hisHospcode,
            visitNo,
            hisHospcode,
            visitNo,
            hisHospcode,
            visitNo,
        ]);
        return result.rows;
    }

    async getChargeOpd(db: Knex, visitNo, hospCode = hisHospcode) {
        // ifnull(right(concat('00000000', p.person_id), ${hn_len}),pt.hn) as pid2,
        const sql = `
            select
                $1 as hospcode,
                pt.hn as pid,
                os.seq_id, os.vn as seq, os.vn,
                CASE 
                    WHEN ovst.vstdate is null
                        or trim(ovst.vstdate::text) = ''
                        or ovst.vstdate::text like '0000-00-00%'
                    THEN ''
                    ELSE to_char(ovst.vstdate,'YYYY-MM-DD')
                END as date_serv,
                CASE WHEN sp.provis_code is null or sp.provis_code ='' THEN '00100' ELSE sp.provis_code END as clinic,
                o.income as chargeitem,
                CASE WHEN d.charge_list_id is null or d.charge_list_id ='' THEN '0000000' ELSE LPAD(d.charge_list_id::text, 6, '0') END as chargelist,
                o.qty as quantity,
                CASE WHEN p2.pttype_std_code is null or p2.pttype_std_code ='' THEN '9100' ELSE p2.pttype_std_code END as instype,
                ROUND(o.cost,2) as cost,
                ROUND(o.sum_price,2) as price,
                '0.00' as payprice,
                CASE 
                    WHEN (ovst.vstdate::text || ' ' || ovst.cur_dep_time::text) is null
                        or trim(ovst.vstdate::text || ' ' || ovst.cur_dep_time::text)=''
                        or (ovst.vstdate::text || ' ' || ovst.cur_dep_time::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((ovst.vstdate::text || ' ' || ovst.cur_dep_time::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as d_update

            from
                opitemrece o
                left join ovst on o.vn=ovst.vn
                left join person p on o.hn=p.patient_hn
                left join spclty sp on sp.spclty=ovst.spclty
                left join pttype p2 on p2.pttype = o.pttype
                left join patient pt on pt.hn = o.hn
                left join ovst_seq os on os.vn = o.vn
                left join drugitems_charge_list d on d.icode = o.icode

            where os.vn=$2
            `;
        const result = await db.raw(sql, [hisHospcode, visitNo]);
        return result.rows;
    }

    getLabRequest(
        db: Knex,
        columnName: string,
        searchNo: string,
        hospCode = hisHospcode,
    ) {
        columnName = columnName === "visitNo" ? "vn" : columnName;
        return db("lab_order as o")
            .leftJoin(
                "lab_order_service as s",
                "o.lab_order_number",
                "s.lab_order_number",
            )
            .select(db.raw(`'${hospCode}' as hospcode`))
            .select(
                "vn as visitno",
                "lab.hn as hn",
                "lab.an as an",
                "lab.lab_no as request_id",
                "lab.lab_code as LOCALCODE",
                "lab.lab_name as INVESTNAME",
                "lab.loinc as loinc",
                "lab.icdcm as icdcm",
                "lab.standard as cgd",
                "lab.cost as cost",
                "lab.lab_price as price",
                "lab.date as DATETIME_REPORT",
            )
            .where(columnName, "=", searchNo)
            .limit(maxLimit);
    }

    getInvestigation(
        db: Knex,
        columnName: string,
        searchNo: string,
        hospCode = hisHospcode,
    ) {
        return this.getLabResult(db, columnName, searchNo);
    }
    getLabResult(db: Knex, columnName: string, searchNo: string) {
        columnName = columnName === "visitNo" ? "lab_head.vn" : columnName;
        columnName = columnName === "hn" ? "ovst.hn" : columnName;
        columnName = columnName === "cid" ? "patient.cid" : columnName;

        return (
            db("lab_head")
                .leftJoin(
                    "lab_order",
                    "lab_head.lab_order_number",
                    "lab_order.lab_order_number",
                )
                .leftJoin(
                    "lab_items",
                    "lab_order.lab_items_code",
                    "lab_items.lab_items_code",
                )
                .leftJoin(
                    "lab_items_sub_group",
                    "lab_items.lab_items_sub_group_code",
                    "lab_items_sub_group.lab_items_sub_group_code",
                )
                .innerJoin("ovst", "lab_head.vn", "ovst.vn")
                .innerJoin("patient", "ovst.hn", "patient.hn")
                .select(
                    db.raw(`'${hisHospcode}' as HOSPCODE,'LAB' as INVESTTYPE`),
                )
                .select(
                    "lab_head.vn",
                    "lab_head.vn as visitno",
                    "lab_head.vn as SEQ",
                    "lab_head.hn as PID",
                    "patient.cid as CID",
                    "lab_head.lab_order_number as request_id",
                    "lab_order.lab_items_code as LOCALCODE",
                    "lab_items.tmlt_code as tmlt",
                    "lab_head.form_name as lab_group",
                    "lab_order.lab_items_name_ref as INVESTNAME",
                    "lab_order.lab_order_result as INVESTVALUE",
                    // 'lab_order.lab_order_remark as INVESTRESULT',
                    "lab_items.icode as ICDCM",
                    "lab_items.lab_items_sub_group_code as GROUPCODE",
                    "lab_items_sub_group.lab_items_sub_group_name as GROUPNAME",
                )
                // .select(db.raw(`concat(lab_items.lab_items_unit, ' ', lab_order.lab_items_normal_value_ref) as UNIT`))
                .select(
                    db.raw(
                        `case when lab_order.lab_items_normal_value_ref IS NOT NULL AND lab_order.lab_items_normal_value_ref != '' then (lab_items.lab_items_unit || ' (' || lab_order.lab_items_normal_value_ref || ')') else lab_items.lab_items_unit end as UNIT`,
                    ),
                )
                .select(
                    db.raw(
                        `(lab_head.order_date || ' ' || lab_head.order_time) as DATETIME_INVEST`,
                    ),
                )
                .select(
                    db.raw(
                        `(lab_head.report_date || ' ' || lab_head.report_time) as DATETIME_REPORT`,
                    ),
                )
                .where(columnName, searchNo)
                .where(`lab_order.confirm`, "Y")
                .whereNot(`lab_order.lab_order_result`, "")
                .whereNotNull("lab_order.lab_order_result")
                .limit(maxLimit)
        );
    }

    async getDrugOpd(db: Knex, visitNo, hospCode = hisHospcode) {
        const sql = `
            SELECT $1 as HOSPCODE,
                pt.hn as PID, pt.cid as CID,
                os.seq_id, os.vn as SEQ, os.vn,
                CASE 
                    WHEN opi.vstdate is null
                        or trim(opi.vstdate::text)=''
                        or opi.vstdate::text like '0000-00-00%'
                    THEN ''
                    ELSE to_char(opi.vstdate,'YYYY-MM-DD')
                END as date_serv,
                sp.provis_code as clinic,
                d.did as DID,d.tmt_tp_code as DID_TMT,
                d.icode as dcode, d.name as dname,
                opi.qty as amount,
                d.packqty as unit,
                d.units  as unit_packing,
				(d.usage_code || ' ' || d.frequency_code || ' ' || d.usage_unit_code || ' ' || d.time_code) as usage_code,
				(drugusage.name1 || ' ' || drugusage.name2 || ' ' || drugusage.name3) as drug_usage,
				d.therapeutic as caution,
                ROUND(opi.unitprice,2) as drugprice,
                ROUND(d.unitcost,2) as drugcost,
                opi.doctor as provider,
                CASE 
                    WHEN opi.last_modified is null
                        or trim(opi.last_modified::text)=''
                        or opi.last_modified::text like '0000-00-00%'
                    THEN to_char((opi.rxdate::text || ' ' || opi.rxtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                    ELSE to_char(opi.last_modified,'YYYY-MM-DD HH24:MI:SS')
                END as d_update

            FROM
                opitemrece opi
                left join ovst o on o.vn=opi.vn  and o.hn=opi.hn
                inner join drugitems d on opi.icode=d.icode
                left join drugusage on d.drugusage=drugusage.drugusage
                left join spclty sp on o.spclty=sp.spclty
                left join person p on opi.hn=p.patient_hn
                left join patient pt on pt.hn = o.hn
                left join ovst_seq os on os.vn = o.vn

            WHERE
                (opi.an is null or opi.an ='')
                and opi.vn not in (select i.vn from ipt as i where i.vn=opi.vn)
                and opi.icode like '1%'
                and os.vn=$2
        `;
        const result = await db.raw(sql, [hisHospcode, visitNo]);
        return result.rows;
    }

    async getAdmission(
        db: Knex,
        columnName: string,
        searchValue: any,
        hospCode = hisHospcode,
    ) {
        columnName = columnName === "an" ? "i.an" : columnName;
        columnName = columnName === "hn" ? "i.hn" : columnName;
        columnName = columnName === "visitNo" ? "q.vn" : columnName;
        columnName = columnName === "dateadmit" ? "i.regdate" : columnName;
        columnName = columnName === "datedisc" ? "i.dchdate" : columnName;

        let sqlCommand = db("ipt as i")
            .leftJoin("an_stat as a", "i.an", "a.an")
            .leftJoin("iptdiag as idx", "i.an", "idx.an")
            .leftJoin("patient as pt", "i.hn", "pt.hn")
            .leftJoin("person as p", "p.patient_hn", "pt.hn")
            .leftJoin("ovst as o", "o.vn", "i.vn")
            .leftJoin("ovst_seq as q", "q.vn", "o.vn")
            .leftJoin("opdscreen as os", "o.vn", "os.vn")
            .leftJoin("spclty as s", "i.spclty", "s.spclty")
            .leftJoin("pttype as p1", "p1.pttype", "i.pttype")
            .leftJoin("provis_instype as ps", "ps.CODE", "p1.nhso_code")
            .leftJoin("dchtype as dt", "i.dchtype", "dt.dchtype")
            .leftJoin("dchstts as ds", "i.dchstts", "ds.dchstts")
            .leftJoin("opitemrece as c", "c.an", "i.an")
            .leftJoin("doctor", "a.dx_doctor", "doctor.code")
            .leftJoin("ward", "i.ward", "ward.ward");
        if (Array.isArray(searchValue)) {
            sqlCommand.whereIn(columnName, searchValue);
        } else {
            sqlCommand.where(columnName, searchValue);
        }
        if (columnName == "i.dchdate") {
            sqlCommand.whereRaw("LENGTH(i.rfrilct)=5"); // get only referin
        }
        return sqlCommand
            .select(
                db.raw(
                    `
                $1 as HOSPCODE,
                i.hn as PID,
                q.seq_id, o.vn SEQ,
                i.an AS AN, pt.cid, pt.sex as SEX,
                to_char((i.regdate::text || ' ' || i.regtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS') as datetime_admit,
                i.ward as WARD_LOCAL,
                CASE WHEN s.provis_code IS NULL THEN '' ELSE s.provis_code END AS wardadmit,
                ward.name as WARDADMITNAME,
                CASE WHEN ps.pttype_std_code IS NOT NULL THEN ps.pttype_std_code ELSE '' END AS instype,
                RIGHT ((SELECT export_code FROM ovstist WHERE ovstist = i.ivstist),1) AS typein,
                i.rfrilct as referinhosp,
                i.rfrics as causein,
                CASE 
                    WHEN i.bw = 0 THEN ''
                    WHEN i.bw IS NOT NULL THEN ROUND(i.bw / 1000, 1)::text
                    WHEN os.bw = 0 THEN ''
                    ELSE ROUND(os.bw, 1)::text
                END as ddmitweight,
                CASE WHEN os.height = 0 THEN '' ELSE os.height::text END as admitheight,
                CASE WHEN i.dchdate IS NULL THEN '' ELSE to_char((i.dchdate::text || ' ' || i.dchtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS') END AS datetime_disch,
                CASE WHEN s.provis_code IS NULL THEN '' ELSE s.provis_code END AS warddisch,
                ward.name as WARDDISCHNAME,
                CASE WHEN ds.nhso_dchstts IS NULL THEN '' ELSE ds.nhso_dchstts END AS dischstatus,
                CASE WHEN dt.nhso_dchtype IS NULL THEN '' ELSE dt.nhso_dchtype END AS dischtype,
                CASE WHEN i.dchtype = '04' THEN i.rfrolct ELSE '' END AS referouthosp,
                CASE 
                    WHEN i.dchtype = '04' THEN
                        CASE 
                            WHEN i.rfrocs = '7' THEN '5'
                            WHEN i.rfrocs IS NOT NULL THEN '1'
                            ELSE ''
                        END
                    ELSE ''
                END as causeout,
                CASE WHEN sum(c.qty * c.cost) IS NULL THEN 0 ELSE ROUND(sum(c.qty * c.cost),0) END AS cost,
                CASE WHEN a.uc_money IS NULL THEN 0.00 ELSE ROUND(a.uc_money,2) END AS price,
                ROUND(
                    sum(
                        CASE 
                            WHEN c.paidst IN ('01', '03') THEN c.sum_price
                            ELSE 0
                        END
                    ),
                    2
                ) payprice,
                CASE WHEN a.paid_money IS NULL THEN 0.00 ELSE ROUND(a.paid_money,2) END AS actualpay,
                a.dx_doctor as dr, doctor.licenseno as provider,
                CASE WHEN idx.modify_datetime IS NULL THEN '' ELSE to_char(idx.modify_datetime,'YYYY-MM-DD HH24:MI:SS') END AS d_update,
                i.drg, a.rw, i.adjrw, i.wtlos,
                CASE WHEN i.grouper_err IS NULL THEN 1 ELSE i.grouper_err END AS error,
                CASE WHEN i.grouper_warn IS NULL THEN 64 ELSE i.grouper_warn END AS warning,
                CASE WHEN i.grouper_actlos IS NULL THEN 0 ELSE i.grouper_actlos END AS actlos,
                CASE WHEN i.grouper_version IS NULL THEN '5.1.3' ELSE i.grouper_version END AS grouper_version
        `,
                    [hisHospcode],
                ),
            )
            .groupBy(
                "i.an", "i.hn", "q.seq_id", "o.vn", "pt.cid", "pt.sex",
                "i.regdate", "i.regtime", "i.ward", "s.provis_code", "ward.name",
                "ps.pttype_std_code", "i.ivstist", "i.rfrilct", "i.rfrics",
                "i.bw", "os.bw", "os.height", "i.dchdate", "i.dchtime",
                "ds.nhso_dchstts", "dt.nhso_dchtype", "i.dchtype", "i.rfrolct",
                "i.rfrocs", "a.uc_money", "a.paid_money", "a.dx_doctor",
                "doctor.licenseno", "idx.modify_datetime", "i.drg", "a.rw",
                "i.adjrw", "i.wtlos", "i.grouper_err", "i.grouper_warn",
                "i.grouper_actlos", "i.grouper_version"
            );
    }

    async getAdmission_(
        db: Knex,
        columnName,
        searchValue,
        hospCode = hisHospcode,
    ) {
        columnName = columnName === "an" ? "i.an" : columnName;
        columnName = columnName === "hn" ? "i.hn" : columnName;
        columnName = columnName === "visitNo" ? "q.vn" : columnName;
        columnName = columnName === "dateadmit" ? "i.regdate" : columnName;
        columnName = columnName === "datedisc" ? "i.dchdate" : columnName;
        let validRefer =
            columnName === "datedisc" ? " AND LENGTH(i.rfrilct)=5 " : "";
        const sql = `
            SELECT
                $1 as HOSPCODE,
                i.hn as PID,
                q.seq_id, o.vn SEQ, i.an AS AN, pt.sex as SEX,
                to_char((i.regdate::text || ' ' || i.regtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS') as datetime_admit,
                i.ward as WARD_LOCAL,
                CASE WHEN s.provis_code IS NULL THEN '' ELSE s.provis_code END AS wardadmit,
                ward.name as WARDADMITNAME,
                CASE WHEN ps.pttype_std_code IS NOT NULL THEN ps.pttype_std_code ELSE '' END AS instype,
                RIGHT ((SELECT export_code FROM ovstist WHERE ovstist = i.ivstist),1) AS typein,
                i.rfrilct as referinhosp,
                i.rfrics as causein,
                CASE 
                    WHEN i.bw = 0 THEN ''
                    WHEN i.bw IS NOT NULL THEN ROUND(i.bw / 1000, 1)::text
                    WHEN os.bw = 0 THEN ''
                    ELSE ROUND(os.bw, 1)::text
                END as ddmitweight,
                CASE WHEN os.height = 0 THEN '' ELSE os.height::text END as admitheight,
                to_char((i.dchdate::text || ' ' || i.dchtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS') as datetime_disch,
                s.provis_code as warddisch, ward.name as WARDDISCHNAME,
                ds.nhso_dchstts as dischstatus,
                dt.nhso_dchtype as dischtype,
                CASE WHEN i.dchtype = '04' THEN i.rfrolct ELSE '' END referouthosp,
                CASE 
                    WHEN i.dchtype = '04' THEN
                        CASE 
                            WHEN i.rfrocs = '7' THEN '5'
                            WHEN i.rfrocs IS NOT NULL THEN '1'
                            ELSE ''
                        END
                    ELSE ''
                END as causeout,
                ROUND(CASE WHEN sum(c.qty * c.cost) IS NULL THEN 0 ELSE sum(c.qty * c.cost) END) AS cost,
                ROUND(CASE WHEN a.uc_money IS NULL THEN 0 ELSE a.uc_money END) AS price,
                ROUND(
                    sum(
                        CASE 
                            WHEN c.paidst IN ('01', '03') THEN c.sum_price
                            ELSE 0
                        END
                    ),
                    2
                ) payprice,
                ROUND(COALESCE(a.paid_money, 0),2) actualpay,
                a.dx_doctor provider,
                COALESCE(
                    to_char(
                    idx.modify_datetime,
                    'YYYY-MM-DD HH24:MI:SS'
                    ),
                    ''
                ) d_update,
                COALESCE(i.drg, 0) drg,
                COALESCE(a.rw, 0) rw,
                COALESCE(i.adjrw, 0) adjrw,
                COALESCE(i.grouper_err, 1) error,
                COALESCE(i.grouper_warn, 64) warning,
                COALESCE(i.grouper_actlos, 0) actlos,
                COALESCE(i.grouper_version, '5.1.3') grouper_version,
                COALESCE(pt.cid, '') cid
            FROM
                ipt as i
                LEFT JOIN an_stat a ON i.an = a.an
                LEFT JOIN iptdiag idx ON i.an = idx.an
                LEFT JOIN patient pt ON i.hn = pt.hn
                LEFT JOIN person p ON p.patient_hn = pt.hn
                LEFT JOIN ovst o ON o.vn = i.vn
                LEFT JOIN ovst_seq q ON q.vn = o.vn
                LEFT JOIN opdscreen os ON o.vn = os.vn
                LEFT JOIN spclty s ON i.spclty = s.spclty
                LEFT JOIN pttype p1 ON p1.pttype = i.pttype
                LEFT JOIN provis_instype ps ON ps. CODE = p1.nhso_code
                LEFT JOIN dchtype dt ON i.dchtype = dt.dchtype
                LEFT JOIN dchstts ds ON i.dchstts = ds.dchstts
                LEFT JOIN opitemrece c ON c.an = i.an
                LEFT JOIN ward ON i.ward = ward.ward
            WHERE ${columnName}=$2 ${validRefer}
            GROUP BY i.an, i.hn, q.seq_id, o.vn, pt.sex, i.regdate, i.regtime, 
                     i.ward, s.provis_code, ward.name, ps.pttype_std_code, i.ivstist, 
                     i.rfrilct, i.rfrics, i.bw, os.bw, os.height, i.dchdate, i.dchtime, 
                     ds.nhso_dchstts, dt.nhso_dchtype, i.dchtype, i.rfrolct, i.rfrocs, 
                     a.uc_money, a.paid_money, a.dx_doctor, idx.modify_datetime, 
                     i.drg, a.rw, i.adjrw, i.grouper_err, i.grouper_warn, 
                     i.grouper_actlos, i.grouper_version, pt.cid `;
        const result = await db.raw(sql, [hisHospcode, searchValue]);
        return result.rows;
    }

    async getDiagnosisIpd(
        db: Knex,
        columnName,
        searchNo,
        hospCode = hisHospcode,
    ) {
        columnName = columnName === "visitNo" ? "q.vn" : columnName;
        columnName = columnName === "an" ? "ipt.an" : columnName;
        const sql = `
            select
                $1 as hospcode,
                pt.hn as pid,
                ipt.an as an,
                COALESCE(to_char((ipt.regdate::text || ' ' || ipt.regtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS'),'') as datetime_admit,
                ('0' || RIGHT(spclty.provis_code,4)) as warddiag,
                iptdiag.diagtype as diagtype,
                iptdiag.icd10 as diagcode,
                icd.name AS diagname,
                iptdiag.doctor as provider,
                COALESCE(to_char(iptdiag.modify_datetime,'YYYY-MM-DD HH24:MI:SS'),to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')) d_update,
                pt.cid as CID

            from
                iptdiag
                left join ipt on ipt.an=iptdiag.an
                left join ovst_seq q ON q.vn = ipt.vn
                left join patient pt on pt.hn = ipt.hn
                left join person p on p.patient_hn = ipt.hn
                LEFT JOIN icd10_sss as icd ON iptdiag.icd10 = icd.code
                left outer join spclty on spclty.spclty=ipt.spclty
            where ${columnName} = $2
            order by ipt.an, iptdiag.diagtype`;
        const result = await db.raw(sql, [hisHospcode, searchNo]);
        return result.rows;
    }
    async getDiagnosisIpdAccident(
        db: Knex,
        dateStart: any,
        dateEnd: any,
        hospCode = hisHospcode,
    ) {
        if (dateStart & dateEnd) {
            return db("iptdiag as dx")
                .innerJoin("ipt as ipd", "dx.an", "ipd.an")
                .innerJoin("icd10_sss as icd", "dx.icd10", "icd.code")
                .select("dx.*", "icd.name AS diagname")
                .whereBetween("ipd.dchdate", [dateStart, dateEnd])
                .whereRaw(`SUBSTRING(dx.icd10,1,1) IN ('V','W','X','Y')`)
                .limit(maxLimit);
        } else {
            throw new Error("Invalid parameters");
        }
    }

    async getProcedureIpd(db: Knex, an, hospCode = hisHospcode) {
        const sql = `
            select
                $1 as hospcode,
                pt.hn as pid,
                ipt.an,
                CASE 
                    WHEN ipt.regdate IS NULL OR ipt.regdate::text = '0000-00-00' THEN ''
                    ELSE to_char((ipt.regdate::text || ' ' || ipt.regtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                END as datetime_admit,
                ('0' || RIGHT(spclty.provis_code, 4)) as wardstay,
                ipc.icd9cm as procedcode,
                CASE 
                    WHEN i.begin_date_time IS NULL OR i.begin_date_time::text LIKE '0000-00-00%' THEN ''
                    ELSE to_char(i.begin_date_time, 'YYYY-MM-DD HH24:MI:SS')
                END as timestart,
                CASE 
                    WHEN i.end_date_time IS NULL OR i.end_date_time::text LIKE '0000-00-00%' THEN ''
                    ELSE to_char(i.end_date_time, 'YYYY-MM-DD HH24:MI:SS')
                END as timefinish,
                CASE 
                    WHEN ipc.price IS NOT NULL THEN REPLACE(ROUND(ipc.price, 2)::text, ',', '')
                    ELSE '0.00'
                END as serviceprice,
                i.doctor as provider,
                CASE 
                    WHEN ipt.dchdate IS NOT NULL AND ipt.dchdate::text != '0000-00-00' 
                    THEN to_char((ipt.dchdate::text || ' ' || ipt.dchtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                    ELSE ''
                END as d_update
            from
                ipt_nurse_oper i
                left join an_stat a on a.an = i.an
                left join ipt on ipt.an = a.an
                left join patient pt on pt.hn = ipt.hn
                left join person p on p.patient_hn = ipt.hn
                left join spclty on spclty.spclty = ipt.spclty
                left join ipt_oper_code ipc on ipc.ipt_oper_code = i.ipt_oper_code
            where ipt.an = $2

            union all

            select
                $3 as hospcode,
                pt.hn as pid,
                ipt.an,
                CASE 
                    WHEN CONCAT(ipt.regdate::text, ' ', ipt.regtime::text) IS NULL 
                         OR TRIM(CONCAT(ipt.regdate::text, ' ', ipt.regtime::text)) = '' 
                         OR CONCAT(ipt.regdate::text, ' ', ipt.regtime::text) LIKE '0000-00-00%'
                    THEN ''
                    ELSE to_char((ipt.regdate::text || ' ' || ipt.regtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                END as datetime_admit,
                ('0' || RIGHT(spclty.provis_code, 4)) as wardstay,
                i.icd9 as procedcode,
                CASE 
                    WHEN CONCAT(i.opdate::text, ' ', i.optime::text) IS NULL 
                         OR TRIM(CONCAT(i.opdate::text, ' ', i.optime::text)) = '' 
                         OR CONCAT(i.opdate::text, ' ', i.optime::text) LIKE '0000-00-00%'
                    THEN ''
                    ELSE to_char((i.opdate::text || ' ' || i.optime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                END as timestart,
                CASE 
                    WHEN CONCAT(i.enddate::text, ' ', i.endtime::text) IS NULL 
                         OR TRIM(CONCAT(i.enddate::text, ' ', i.endtime::text)) = '' 
                         OR CONCAT(i.enddate::text, ' ', i.endtime::text) LIKE '0000-00-00%'
                    THEN ''
                    ELSE to_char((i.enddate::text || ' ' || i.endtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                END as timefinish,
                CASE 
                    WHEN i.iprice IS NOT NULL THEN REPLACE(ROUND(i.iprice, 2)::text, ',', '')
                    ELSE '0.00'
                END as serviceprice,
                i.doctor as provider,
                CASE 
                    WHEN ipt.dchdate IS NOT NULL OR ipt.dchdate <> '' THEN
                        CASE 
                            WHEN CONCAT(ipt.dchdate::text, ' ', ipt.dchtime::text) IS NULL 
                                 OR TRIM(CONCAT(ipt.dchdate::text, ' ', ipt.dchtime::text)) = '' 
                                 OR CONCAT(ipt.dchdate::text, ' ', ipt.dchtime::text) LIKE '0000-00-00%'
                            THEN ''
                            ELSE to_char((ipt.dchdate::text || ' ' || ipt.dchtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                        END
                    ELSE
                        CASE 
                            WHEN CONCAT(ipt.regdate::text, ' ', ipt.regtime::text) IS NULL 
                                 OR TRIM(CONCAT(ipt.regdate::text, ' ', ipt.regtime::text)) = '' 
                                 OR CONCAT(ipt.regdate::text, ' ', ipt.regtime::text) LIKE '0000-00-00%'
                            THEN ''
                            ELSE to_char((ipt.regdate::text || ' ' || ipt.regtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                        END
                END as d_update
            from
                iptoprt i
                left join an_stat a on a.an=i.an
                left join ipt  on ipt.an=a.an
                left join patient pt on pt.hn = ipt.hn
                left join person p on p.patient_hn = ipt.hn
                left join spclty on spclty.spclty=ipt.spclty
            where
                ipt.an= $4
            `;
        // const result = await db.raw(sql1, [hisHospcode, an, hisHospcode, an]);
        const result = await db.raw(sql, [hisHospcode, an, hisHospcode, an]);
        return result.rows;
    }

    async getChargeIpd(db: Knex, an, hospCode = hisHospcode) {
        const sql = `
            select
                $1 as hospcode,
                pt.hn as pid,
                o.an as an,
                CASE 
                    WHEN CONCAT(ipt.regdate::text, ' ', ipt.regtime::text) IS NULL
                         OR TRIM(CONCAT(ipt.regdate::text, ' ', ipt.regtime::text)) = ''
                         OR CONCAT(ipt.regdate::text, ' ', ipt.regtime::text) LIKE '0000-00-00%'
                    THEN ''
                    ELSE to_char((ipt.regdate::text || ' ' || ipt.regtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                END as datetime_admit,
                ('1' || RIGHT(sp.provis_code, 4)) as wardstay,
                o.income as chargeitem,
                CASE 
                    WHEN d.charge_list_id IS NULL OR d.charge_list_id = '' THEN '000000'
                    ELSE RIGHT(('000000' || d.charge_list_id), 6)
                END as chargelist,
                ROUND(o.qty, 2)::text as quantity,
                CASE 
                    WHEN psi.pttype_std_code IS NULL OR psi.pttype_std_code = '' THEN '9100'
                    ELSE psi.pttype_std_code
                END as instype,
                ROUND(o.cost, 2)::text as cost,
                ROUND(o.sum_price, 2)::text as price,
                '0.00' as payprice,
                CASE 
                    WHEN CONCAT(o.rxdate::text, ' ', o.rxtime::text) IS NULL
                         OR TRIM(CONCAT(o.rxdate::text, ' ', o.rxtime::text)) = ''
                         OR CONCAT(o.rxdate::text, ' ', o.rxtime::text) LIKE '0000-00-00%'
                    THEN ''
                    ELSE to_char((o.rxdate::text || ' ' || o.rxtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS')
                END as d_update

            from
                opitemrece o
                left join ipt on o.hn=ipt.hn and o.an=ipt.an
                left join person p on o.hn=p.patient_hn
                left join spclty sp on sp.spclty=ipt.spclty
                left join provis_instype psi on psi.code = ipt.pttype
                left join patient pt on pt.hn = ipt.hn
                left join drugitems_charge_list d on d.icode = o.icode

            where
                (o.an <> '' OR o.an IS NOT NULL)
                and o.unitprice <> '0'
                and ipt.an= $2
            `;
        const result = await db.raw(sql, [hisHospcode, an]);
        return result.rows;
    }

    async getDrugIpd(db: Knex, an, hospCode = hisHospcode) {
        const sql = `
            select
                $1 as HOSPCODE
                ,COALESCE(p.person_id,'') PID
                ,COALESCE(i.an,'') AN
                ,COALESCE(to_char((i.regdate::text || ' ' || i.regtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS'),'') DATETIME_ADMIT
                ,COALESCE(s.provis_code,'') WARDSTAY
                ,CASE WHEN o.item_type='H' THEN '2' ELSE '1' END TYPEDRUG
                ,COALESCE(d.did,'') DIDSTD
                ,COALESCE(d.name || ' ' || d.strength,'') DNAME
                ,COALESCE(to_char(m.orderdate, 'YYYY-MM-DD'),'') DATESTART
                ,COALESCE(to_char(m.offdate, 'YYYY-MM-DD'),'') DATEFINISH
                ,CAST(sum(COALESCE(o.qty,0)) as decimal(12,0)) AMOUNT
                ,COALESCE(d.provis_medication_unit_code,'') UNIT
                ,COALESCE(d.packqty,'') UNIT_PACKING
                ,CAST(COALESCE(d.unitprice,0) as decimal(11,2)) DRUGPRICE
                ,CAST(CASE WHEN d.unitcost IS NULL OR d.unitcost=0 THEN COALESCE(d.unitprice,0) ELSE d.unitcost END as decimal(11,2)) DRUGCOST
                ,o.doctor PROVIDER
                ,COALESCE(to_char((o.rxdate::text || ' ' || o.rxtime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS'),'') D_UPDATE
                ,pt.cid as CID
            from ipt as i
                left join an_stat a on a.an=i.an
                left join opitemrece o on o.an=i.an
                left join patient pt on pt.hn=i.hn
                left join person p on p.patient_hn=pt.hn
                left join spclty s on s.spclty=i.spclty
                left join drugitems d on d.icode=o.icode
                left join medplan_ipd m on m.an=o.an and m.icode=o.icode
            where
                i.an=$2
                and d.icode is not null
                and o.qty<>0
                and o.sum_price>0
            group by i.an,o.icode,CASE WHEN o.item_type='H' THEN '2' ELSE '1' END,
                     p.person_id,s.provis_code,d.did,d.name,d.strength,
                     m.orderdate,m.offdate,d.provis_medication_unit_code,
                     d.packqty,d.unitprice,d.unitcost,o.doctor,o.rxdate,o.rxtime,pt.cid
            order by i.an,CASE WHEN o.item_type='H' THEN '2' ELSE '1' END,o.icode
            `;
        const result = await db.raw(sql, [hisHospcode, an]);
        return result.rows;
    }

    async getAccident(db: Knex, visitNo, hospCode = hisHospcode) {
        const sql = `
            select
                $1 as hospcode,
                p.hn, p.hn as pid, p.cid,
                q.seq_id, q.vn as seq,
                to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS') datetime_serv,
                to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp, 'YYYY-MM-DD HH24:MI:SS') datetime_ae,
                COALESCE(LPAD(d.er_accident_type_id::text, 2, '0'),'') aetype,
                COALESCE(LPAD(d.accident_place_type_id::text, 2, '0'),'99') aeplace,
                COALESCE(vt.export_code, '1') typein_ae,
                COALESCE(d.accident_person_type_id,'9') traffic,
                COALESCE(tt.export_code, '99') vehicle,
                COALESCE(d.accident_alcohol_type_id,'9') alcohol,
                COALESCE(d.accident_drug_type_id,'9') nacrotic_drug,
                COALESCE(d.accident_belt_type_id,'9') belt,
                COALESCE(d.accident_helmet_type_id,'9') helmet,
                COALESCE(d.accident_airway_type_id,'3') airway,
                COALESCE(d.accident_bleed_type_id,'3') stopbleed,
                COALESCE(d.accident_splint_type_id,'3') splint,
                COALESCE(d.accident_fluid_type_id,'3') fluid,
                COALESCE(d.er_emergency_type, '6') urgency,
                CASE WHEN d.gcs_e IN (1, 2, 3, 4) THEN d.gcs_e ELSE '4' END coma_eye,
                CASE WHEN d.gcs_v IN (1, 2, 3, 4, 5) THEN d.gcs_v ELSE '5' END coma_speak,
                CASE WHEN d.gcs_m IN (1, 2, 3, 4, 5, 6) THEN d.gcs_m ELSE '6' END coma_movement,
                to_char(now(), 'YYYY-MM-DD HH24:MI:SS') d_update
            FROM
                er_regist er
            LEFT JOIN ovst o ON er.vn = o.vn
            LEFT JOIN er_pt_type t ON t.er_pt_type = er.er_pt_type
            LEFT JOIN ovst_seq q ON o.vn = q.vn
            LEFT JOIN patient pt ON pt.hn = o.hn
            LEFT JOIN person p ON p.patient_hn = pt.hn
            LEFT JOIN er_nursing_detail d ON er.vn = d.vn
            LEFT JOIN er_nursing_visit_type vt ON vt.visit_type = d.visit_type
            LEFT JOIN accident_transport_type tt ON tt.accident_transport_type_id = d.accident_transport_type_id
            where
                q.vn =$2
            `;
        const result = await db.raw(sql, [hisHospcode, visitNo]);
        return result.rows;
    }

    async getDrugAllergy(db: Knex, hn, hospCode = hisHospcode) {
        return db("opd_allergy as oe")
            .leftJoin("drugitems_register as di", "oe.agent", "di.drugname")
            .leftJoin("patient", "oe.hn", "patient.hn")
            .leftJoin("person", "oe.hn", "person.patient_hn")
            .select(db.raw("? as HOSPCODE", [hisHospcode]))
            .select(
                "patient.hn as PID",
                "patient.cid as CID",
                "di.std_code as DRUGALLERGY",
                "oe.agent as DNAME",
                "oe.seriousness_id as ALEVE",
                "oe.symptom as DETAIL",
                "oe.opd_allergy_source_id as INFORMANT",
            )
            .select(
                db.raw(`CASE WHEN oe.report_date is null
                    or trim(oe.report_date::text)=' '
                    or oe.report_date::text like '0000-00-00%'
                    THEN '' ELSE to_char(oe.report_date,'YYYY-MM-DD') END as DATERECORD`),
            )
            .select(db.raw("? as INFORMHOSP", [hisHospcode]))
            .select(
                db.raw(`(select case when
                    oe.allergy_relation_id in ('1','2','3','4','5')
                then  oe.allergy_relation_id
                else  '1'  end) as TYPEDX`),
            )
            .select(db.raw(`'' as SYMPTOM`))
            .select(
                db.raw(`CASE WHEN oe.update_datetime is null or trim(oe.update_datetime::text) = ''
                or oe.update_datetime::text like '0000-00-00%' THEN ''
                ELSE to_char(oe.update_datetime,'YYYY-MM-DD HH24:MI:SS') END as D_UPDATE`),
            )
            .where("oe.hn", hn);
    }

    getAppointment(db, visitNo, hospCode = hisHospcode) {
        return db("view_opd_fu")
            .select(db.raw('"' + hisHospcode + '" as hospcode'))
            .select("*")
            .where("vn", "=", visitNo)
            .limit(maxLimit);
    }

    async getReferHistory(
        db: Knex,
        columnName,
        searchNo,
        hospCode = hisHospcode,
    ) {
        //columnName = visitNo, referNo
        columnName = columnName === "visitNo" ? "os.vn" : columnName;
        columnName = columnName === "vn" ? "os.vn" : columnName;
        columnName = columnName === "seq_id" ? "os.seq_id" : columnName;
        columnName = columnName === "referNo" ? "ro.refer_number" : columnName;
        return db("referout as ro")
            .leftJoin("patient as pt", "pt.hn", "ro.hn")
            .leftJoin("person as ps", "ps.cid", "pt.cid")
            .leftJoin(db.raw("ovst as o on o.vn = ro.vn or o.an=ro.vn"))
            .leftJoin("ipt as i", "i.an", "o.an")
            .leftJoin("ovst_seq as os", "os.vn", "o.vn")
            .leftJoin("spclty as sp", "sp.spclty", "ro.spclty")
            .leftJoin("opdscreen as s", "s.vn", "o.vn")
            .leftJoin("er_regist as e", "e.vn", "o.vn")
            .leftJoin("doctor", "o.doctor", "doctor.code")

            .select(db.raw("? as HOSPCODE", [hisHospcode]))
            .select(
                "ro.refer_number as REFERID",
                db.raw("(? || ro.refer_number) as REFERID_PROVINCE", [
                    hisHospcode,
                ]),
                "pt.hn as PID",
                "pt.cid",
                "os.seq_id",
                "os.vn as SEQ",
                "o.an as AN",
            )
            .select(
                "o.i_refer_number as REFERID_ORIGIN",
                "o.rfrilct as HOSPCODE_ORIGIN",
                db.raw(`CASE WHEN (o.vstdate::text || ' ' || o.vsttime::text) is null
                or trim(o.vstdate::text || ' ' || o.vsttime::text) = ''
                or (o.vstdate::text || ' ' || o.vsttime::text) like '0000-00-00%'
                THEN '' ELSE to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS') END as DATETIME_SERV`),
                db.raw(`CASE WHEN (i.regdate::text || ' ' || i.regtime::text) is null
                        or trim(i.regdate::text || ' ' || i.regtime::text) = ''
                        or (i.regdate::text || ' ' || i.regtime::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((i.regdate::text || ' ' || i.regtime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as DATETIME_ADMIT`),
                db.raw(`CASE 
                    WHEN (ro.refer_date::text || ' ' || ro.refer_time::text) is null
                        or trim(ro.refer_date::text || ' ' || ro.refer_time::text) = ''
                        or (ro.refer_date::text || ' ' || ro.refer_time::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((ro.refer_date::text || ' ' || ro.refer_time::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as DATETIME_REFER,
                CASE 
                    WHEN sp.provis_code is null
                        or sp.provis_code = ''
                    THEN '00100'
                    ELSE sp.provis_code
                END as CLINIC_REFER,
                ro.refer_hospcode as HOSP_DESTINATION,
                ('CC:' || COALESCE(s.cc,'') || ' HPI:' || COALESCE(s.hpi,'') || ' PMH:' || COALESCE(s.pmh,'')) as CHIEFCOMP,
                '' as PHYSICALEXAM,
                COALESCE(ro.pre_diagnosis,'ไม่ระบุ') as DIAGFIRST,
                COALESCE(ro.pre_diagnosis,'ไม่ระบุ') as DIAGLAST,
                COALESCE(ro.ptstatus_text,'ไม่ระบุ') as PSTATUS,
                ovst.doctor as dr, doctor.licenseno as provider,
                (select case e.er_pt_type
                    when '2' then '2'
                    when '1' then '3'
                else
                    '1'
                end
                ) as PTYPE,
                COALESCE(e.er_emergency_level_id,'5') as EMERGENCY,
                '99' as PTYPEDIS,
                CASE 
                    WHEN ro.refer_cause = '1'
                        or ro.refer_cause = '2'
                    THEN ro.refer_cause
                    ELSE '1'
                END as CAUSEOUT,
                ro.request_text as REQUEST,
                ro.doctor as PROVIDER,
                CASE 
                    WHEN (o.vstdate::text || ' ' || o.vsttime::text) is null
                        or trim(o.vstdate::text || ' ' || o.vsttime::text) = ''
                        or (o.vstdate::text || ' ' || o.vsttime::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((o.vstdate::text || ' ' || o.vsttime::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as D_UPDATE `),
            )
            .where(columnName, searchNo)
            .whereNotNull("ro.refer_hospcode")
            .whereNot("ro.refer_hospcode", "");
    }

    getClinicalRefer(db, referNo, hospCode = hisHospcode) {
        return db("view_clinical_refer")
            .select(db.raw(`'${hisHospcode}' as hospcode`))
            .where("refer_no", "=", referNo)
            .limit(maxLimit);
    }

    getInvestigationRefer(db, referNo, hospCode = hisHospcode) {
        return db("view_investigation_refer")
            .select(db.raw(`'${hisHospcode}' as hospcode`))
            .where("refer_no", "=", referNo)
            .limit(maxLimit);
    }

    async getCareRefer(db: Knex, referNo, hospCode = hisHospcode) {
        const sql = `
            select
                '${hisHospcode}' as hospcode,
                ro.refer_number as referid,
                ('${hisHospcode}' || ro.refer_number ) as referid_province,
                '' as caretype,
                CASE 
                    WHEN (ro.refer_date::text || ' ' || ro.refer_time::text) is null
                        or trim(ro.refer_date::text || ' ' || ro.refer_time::text) = ''
                        or (ro.refer_date::text || ' ' || ro.refer_time::text) like '0000-00-00%'
                    THEN ''
                    ELSE to_char((ro.refer_date::text || ' ' || ro.refer_time::text)::timestamp,'YYYY-MM-DD HH24:MI:SS')
                END as d_update

            from
                referout ro
            where
                ro.refer_number = $1
            `;
        const result = await db.raw(sql, [referNo]);
        return result.rows;
    }

    getReferResult(db: Knex, visitDate: string, hospCode = hisHospcode) {
        visitDate = moment(visitDate).format("YYYY-MM-DD");
        return db("referin")
            .leftJoin("patient", "referin.hn", "patient.hn")
            .leftJoin("ovst", "referin.vn", "ovst.vn")
            .leftJoin("refer_reply", "referin.vn", "refer_reply.vn")
            .select(db.raw(`'${hisHospcode}' as HOSPCODE`))
            .select(
                "referin.refer_hospcode as HOSP_SOURCE",
                "patient.cid as CID_IN",
                "referin.hn as PID_IN",
                "referin.vn as SEQ_IN",
                "referin.docno as REFERID",
                "referin.refer_date as DATETIME_REFER",
                "referin.icd10 as detail",
                "refer_reply.diagnosis_text as reply_diagnostic",
                "refer_reply.advice_text as reply_recommend",
            )
            .select(
                db.raw(
                    `case when referin.referin_number IS NOT NULL AND referin.referin_number != '' then referin.referin_number else ('${hisHospcode}-' || referin.docno) end as REFERID_SOURCE`,
                ),
            )
            .select(
                db.raw(
                    `(refer_reply.reply_date || ' ' || refer_reply.reply_time) as reply_date`,
                ),
            )
            .select(
                db.raw(
                    `'' as AN_IN, (referin.refer_hospcode || referin.referin_number) as REFERID_PROVINCE`,
                ),
            )
            .select(
                db.raw(
                    `(ovst.vstdate || ' ' || ovst.vsttime) as DATETIME_IN, '1' as REFER_RESULT`,
                ),
            )
            .select(
                db.raw(`(ovst.vstdate || ' ' || ovst.vsttime) as D_UPDATE`),
            )
            .where(
                db.raw(
                    `(referin.refer_date='${visitDate}' or referin.date_in='${visitDate}')`,
                ),
            )
            .where(db.raw("length(referin.refer_hospcode)=5"))
            .whereNotNull("referin.vn")
            .whereNotNull("patient.hn")
            .limit(maxLimit);
    }

    async getProvider(db: Knex, columnName, searchNo, hospCode = hisHospcode) {
        columnName = columnName === "licenseNo" ? "d.code" : columnName;
        columnName = columnName === "cid" ? "d.cid" : columnName;
        const sql = `
            select
                '${hisHospcode}' as hospcode,
                d.code as provider,
                d.licenseno as registerno,
                d.council_code as council,
                d.cid as cid,
                COALESCE(p2.provis_pname_long_name,d.pname) as prename,
                COALESCE(p.fname,d.fname) as name,
                COALESCE(p.lname,d.lname) as lname,
                d.sex as sex,
                CASE WHEN p.birthday is null or trim(p.birthday::text)='' or p.birthday::text like '0000-00-00%' THEN '' ELSE to_char(p.birthday,'YYYY-MM-DD') END as birth,
                d.provider_type_code as providertype,
                CASE WHEN d.start_date is null or trim(d.start_date::text)='' or d.start_date::text like '0000-00-00%' THEN '' ELSE to_char(d.start_date,'YYYY-MM-DD') END as startdate,
                CASE WHEN d.finish_date is null or trim(d.finish_date::text)='' or d.finish_date::text like '0000-00-00%' THEN '' ELSE to_char(d.finish_date,'YYYY-MM-DD') END as outdate,
                d.move_from_hospcode as movefrom,
                d.move_to_hospcode as moveto,
                CASE WHEN d.update_datetime is null or trim(d.update_datetime::text)='' or d.update_datetime::text like '0000-00-00%' THEN '' ELSE to_char(d.update_datetime,'YYYY-MM-DD HH24:MI:SS') END as d_update

            from
                doctor d
                left join patient p on d.cid = p.cid
                left join pname pn on pn.name = p.pname
                left join provis_pname p2 on p2.provis_pname_code = pn.provis_code
            where
                ${columnName}=$1
            `;
        const result = await db.raw(sql, [searchNo]);
        return result.rows;
    }
    getProviderDr(db: Knex, drList: any[]) {
        return db("doctor as d")
            .leftJoin("patient as p", "d.cid", "p.cid")
            .leftJoin("pname as pn", "pn.name", "p.pname")
            .leftJoin(
                "provis_pname as p2",
                "p2.provis_pname_code",
                "pn.provis_code",
            )
            .select(
                db.raw(`
                '${hisHospcode}' as hospcode,
                d.code as provider,
                d.licenseno as registerno,
                d.council_code as council,
                d.cid as cid,
                CASE WHEN p2.provis_pname_long_name IS NULL THEN d.pname ELSE p2.provis_pname_long_name END as prename,
                CASE WHEN p.fname IS NULL THEN d.fname ELSE p.fname END as name,
                CASE WHEN p.lname IS NULL THEN d.lname ELSE p.lname END as lname,
                d.sex as sex,
                CASE WHEN p.birthday is null or trim(p.birthday::text)='' or p.birthday::text like '0000-00-00%' THEN '' ELSE to_char(p.birthday,'YYYY-MM-DD') END as birth,
                d.provider_type_code as providertype,
                CASE WHEN d.start_date is null or trim(d.start_date::text)='' or d.start_date::text like '0000-00-00%' THEN '' ELSE to_char(d.start_date,'YYYY-MM-DD') END as startdate,
                CASE WHEN d.finish_date is null or trim(d.finish_date::text)='' or d.finish_date::text like '0000-00-00%' THEN '' ELSE to_char(d.finish_date,'YYYY-MM-DD') END as outdate,
                d.move_from_hospcode as movefrom,
                d.move_to_hospcode as moveto,
                CASE WHEN d.update_datetime is null or trim(d.update_datetime::text)='' or d.update_datetime::text like '0000-00-00%' THEN '' ELSE to_char(d.update_datetime,'YYYY-MM-DD HH24:MI:SS') END as d_update`),
            )
            .whereIn("d.code", drList);
    }

    getData(db, tableName, columnName, searchNo, hospCode = hisHospcode) {
        return db(tableName)
            .select(db.raw('"' + hisHospcode + '" as hospcode'))
            .select("*")
            .where(columnName, "=", searchNo)
            .limit(maxLimit);
    }

    // MOPH ERP
    countBedNo(db: Knex) {
        return db('bedno').count('bedno.bedno as total_bed')
            .leftJoin('roomno', 'bedno.roomno', 'roomno.roomno')
            .leftJoin('ward', 'roomno.ward', 'ward.ward')
            .where('ward.ward_active', 'Y').first();
    }

    getBedNo(db: Knex, bedno: any = null) {
        let sql = db('bedno')
            .leftJoin('roomno', 'bedno.roomno', 'roomno.roomno')
            .leftJoin('ward', 'roomno.ward', 'ward.ward')
            .leftJoin('bedtype', 'bedno.bedtype', 'bedtype.bedtype')
            .leftJoin('bed_status_type as status', 'bedno.bed_status_type_id', 'status.bed_status_type_id')
            .select('bedno.bedno', 'bedno.bedtype', 'bedtype.name as bedtype_name', 'bedno.roomno',
                'roomno.ward as wardcode', 'ward.name as wardname', 'bedno.export_code as std_code',
                'bedno.bed_status_type_id', 'status.bed_status_type_name',
                db.raw("CASE WHEN ward.ward_active ='Y' THEN 1 ELSE 0 END as isactive"),
                db.raw(`
                    CASE 
                        WHEN LOWER(bedtype.name) LIKE '%พิเศษ%' THEN 'S'
                        WHEN LOWER(bedtype.name) LIKE '%icu%' OR bedtype.name LIKE '%ไอซียู%' THEN 'ICU'
                        WHEN LOWER(bedtype.name) LIKE '%ห้องคลอด%' OR LOWER(bedtype.name) LIKE '%รอคลอด%' THEN 'LR'
                        WHEN LOWER(bedtype.name) LIKE '%Home Ward%' THEN 'HW'
                        ELSE 'N'
                    END as bed_type
                `)
            )
            .where('ward.ward_active', 'Y')
            .andWhere('bedno.export_code IS NOT NULL');
        if (bedno) {
            sql = sql.where('bedno.bedno', bedno);
        }
        return sql.orderBy('bedno.bedno');
    }

    // Report Zone
    sumReferOut(db: Knex, dateStart: any, dateEnd: any) {
        return db("referout as r")
            .select("r.refer_date")
            .count("r.vn as cases")
            .whereNotNull("r.vn")
            .whereBetween("r.refer_date", [dateStart, dateEnd])
            .where("r.refer_hospcode", "!=", "")
            .whereNotNull("r.refer_hospcode")
            .where("r.refer_hospcode", "!=", hisHospcode)
            .groupBy("r.refer_date")
            .orderBy("r.refer_date");
    }

    sumReferIn(db: Knex, dateStart: any, dateEnd: any) {
        return db("referin")
            .leftJoin("ovst", "referin.vn", "ovst.vn")
            .select("referin.refer_date")
            .count("referin.vn as cases")
            .whereBetween("referin.refer_date", [dateStart, dateEnd])
            .where("referin.refer_hospcode", "!=", hisHospcode)
            .whereNotNull("referin.refer_hospcode")
            .whereNotNull("referin.vn")
            .whereNotNull("ovst.vn")
            .groupBy("referin.refer_date");
    }
    concurrentIPDByWard(db: Knex, date: any) {
        let sql = db("ipt")
            .leftJoin("ward", "ipt.ward", "ward.ward")
            .select(
                "ipt.ward as wardcode",
                "ward.name as wardname",
                db.raw("sum(CASE WHEN ipt.regdate = ? THEN 1 ELSE 0 END) as new_case", [date]),
                db.raw("sum(CASE WHEN ipt.dchdate = ? THEN 1 ELSE 0 END) as discharge", [date]),
                db.raw(`sum(CASE WHEN ipt.dchstts IN ('08','09') THEN 1 ELSE 0 END) as death`),
            )
            .count("* as cases")
            .where("ipt.regdate", "<=", date)
            .whereRaw(`ipt.ward is not null and ipt.ward!= ''`)
            .andWhere(function () {
                this.whereNull("ipt.dchdate").orWhere(
                    "ipt.dchdate",
                    ">=",
                    date,
                );
            });
        return sql.groupBy("ipt.ward", "ward.name").orderBy("ipt.ward");
    }
    concurrentIPDByClinic(db: Knex, date: any) {
        let sql = db("ipt")
            .leftJoin("ipt_spclty as clinic", "ipt.spclty", "clinic.ipt_spclty")
            .select(
                "ipt.spclty as cliniccode",
                "clinic.name as clinicname",
                db.raw("sum(CASE WHEN ipt.regdate = ? THEN 1 ELSE 0 END) as new_case", [date]),
                db.raw("sum(CASE WHEN ipt.dchdate = ? THEN 1 ELSE 0 END) as discharge", [date]),
                db.raw(`sum(CASE WHEN ipt.dchstts IN ('08','09') THEN 1 ELSE 0 END) as death`),
            )
            .count("* as cases")
            .where("ipt.regdate", "<=", date)
            // .whereRaw('ipt.ward is not null and ipt.ward!= ""')
            .andWhere(function () {
                this.whereNull("ipt.dchdate").orWhere(
                    "ipt.dchdate",
                    ">=",
                    date,
                );
            });
        return sql.groupBy("ipt.spclty", "clinic.name").orderBy("ipt.spclty");
    }
    sumOpdVisitByClinic(db: Knex, date: any) {
        let sql = db("ovst")
            .leftJoin("spclty", "ovst.spclty", "spclty.spclty")
            .select(
                "ovst.vstdate as date",
                "spclty.nhso_code as cliniccode",
                "spclty.name as clinicname",
                db.raw(`sum(CASE WHEN an IS NULL or an='' THEN 0 ELSE 1 END) as admit`),
            )
            .count("* as cases")
            .where("ovst.vstdate", date);
        return sql.groupBy("ovst.vstdate", "spclty.nhso_code", "spclty.name").orderBy("spclty.nhso_code");
    }
}

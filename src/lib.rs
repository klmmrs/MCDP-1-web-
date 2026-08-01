use wasm_bindgen::prelude::*;
use std::f64;

#[derive(Clone, Debug)]
pub struct Interval {
    pub b: i32,
    pub e: i32,
}

#[derive(Clone, Debug)]
pub struct ChromosomeData {
    pub name: String,
    pub size: i32,
    pub ref_intervals: Vec<Interval>,
    pub query_intervals: Vec<Interval>,
}

fn logsumexp(vals: &[f64]) -> f64 {
    if vals.is_empty() { return f64::NEG_INFINITY; }
    let max_val = vals.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if max_val.is_infinite() { return max_val; }
    let sum: f64 = vals.iter().map(|&x| libm::exp(x - max_val)).sum();
    max_val + libm::log(sum)
}

fn logaddexp(a: f64, b: f64) -> f64 {
    if a.is_infinite() && a.is_sign_negative() { return b; }
    if b.is_infinite() && b.is_sign_negative() { return a; }
    let max_val = f64::max(a, b);
    max_val + libm::log(libm::exp(a - max_val) + libm::exp(b - max_val))
}

fn mat_mul(a: &[[f64; 2]; 2], b: &[[f64; 2]; 2]) -> [[f64; 2]; 2] {
    [
        [a[0][0]*b[0][0] + a[0][1]*b[1][0], a[0][1]*b[1][1] + a[0][0]*b[0][1]],
        [a[1][0]*b[0][0] + a[1][1]*b[1][0], a[1][1]*b[1][1] + a[1][0]*b[0][1]],
    ]
}

fn mat_pow(a: &[[f64; 2]; 2], n: i32) -> [[f64; 2]; 2] {
    if n <= 0 { return [[1.0, 0.0], [0.0, 1.0]]; }
    if n == 1 { return *a; }
    if n % 2 == 0 {
        let half = mat_pow(a, n / 2);
        mat_mul(&half, &half)
    } else {
        mat_mul(a, &mat_pow(a, n - 1))
    }
}

fn mat_sub(a: &[[f64; 2]; 2], b: &[[f64; 2]; 2]) -> [[f64; 2]; 2] {
    [[a[0][0] - b[0][0], a[0][1] - b[0][1]], [a[1][0] - b[1][0], a[1][1] - b[1][1]]]
}

fn vec_mat_mul(v: &[f64; 2], m: &[[f64; 2]; 2]) -> [f64; 2] {
    [v[0]*m[0][0] + v[1]*m[1][0], v[0]*m[0][1] + v[1]*m[1][1]]
}

struct TDExp {
    t: [[f64; 2]; 2],
    d: [[f64; 2]; 2],
}

impl TDExp {
    fn new(x: f64, y: f64) -> Self {
        TDExp {
            t: [[x, 1.0 - x], [1.0 - y, y]],
            d: [[x, 0.0], [1.0 - y, 0.0]],
        }
    }
    fn exp_t(&self, a: i32) -> [[f64; 2]; 2] { mat_pow(&self.t, a) }
    fn exp_d(&self, a: i32) -> [[f64; 2]; 2] { mat_pow(&self.d, a) }
}

fn estimate_mc_weights_simple(chr_size: i32, q: &[Interval]) -> (f64, f64) {
    let total_intervals_length: i32 = q.iter().map(|i| i.e - i.b).sum();
    let total_gaps_length = chr_size - total_intervals_length;
    let n = q.len() as f64;
    let alpha = -(n + 1.0) + (total_gaps_length as f64);
    let beta = -n + (total_intervals_length as f64);
    (alpha / (alpha + n), beta / (beta + n))
}

fn eval_probs_single_direct_lm_eigen(r: &[Interval], q: &[Interval], chr_size: i32) -> Vec<f64> {
    let m = r.len();
    if q.is_empty() || m == 0 { return vec![0.0]; }

    let (x, y) = estimate_mc_weights_simple(chr_size, q);
    let e = TDExp::new(x, y);

    let mut prev_line = vec![[0.0, 0.0]; m + 1];
    prev_line[0][0] = 1.0;
    let mut last_col = vec![[0.0, 0.0]; m + 1];

    for j in 1..=m {
        let mut g = r[j - 1].b - if j == 1 { 0 } else { r[j - 2].e };
        if j == 1 { g -= 1; }
        let l = r[j - 1].e - r[j - 1].b;
        let step = mat_mul(&e.exp_t(g), &e.exp_d(l));
        prev_line[j] = vec_mat_mul(&prev_line[j - 1], &step);
    }
    last_col[0] = prev_line[m];

    let mut next_line = vec![[0.0, 0.0]; m + 1];
    for k in 1..=m {
        next_line[k - 1] = [0.0, 0.0];
        for j in k..=m {
            let mut g = r[j - 1].b - if j == 1 { 0 } else { r[j - 2].e };
            if j == 1 { g -= 1; }
            let l = r[j - 1].e - r[j - 1].b;

            let dont_hit = vec_mat_mul(&next_line[j - 1], &mat_mul(&e.exp_t(g), &e.exp_d(l)));
            let hit_mat = mat_sub(&e.exp_t(l), &e.exp_d(l));
            let hit = vec_mat_mul(&prev_line[j - 1], &mat_mul(&e.exp_t(g), &hit_mat));

            next_line[j] = [dont_hit[0] + hit[0], dont_hit[1] + hit[1]];
        }
        last_col[k] = next_line[m];
        for j in 0..=m { prev_line[j] = next_line[j]; }
    }

    last_col.iter().map(|&row| libm::log(row[0] + row[1])).collect()
}

fn joint_logprobs(probs_by_level: &[Vec<f64>]) -> Vec<f64> {
    if probs_by_level.is_empty() { return vec![]; }
    if probs_by_level.len() == 1 { return probs_by_level[0].clone(); }

    let max_k: usize = probs_by_level.iter().map(|level| level.len() - 1).sum();
    let mut prev_row = vec![f64::NEG_INFINITY; max_k + 1];
    for (pos, &value) in probs_by_level[0].iter().enumerate() {
        prev_row[pos] = value;
    }

    let mut current_row = vec![f64::NEG_INFINITY; max_k + 1];
    let mut accum = Vec::new();

    for level in &probs_by_level[1..] {
        for k in 0..=max_k {
            let limit = std::cmp::min(k + 1, level.len());
            for j in 0..limit {
                accum.push(level[j] + prev_row[k - j]);
            }
            current_row[k] = logsumexp(&accum);
            accum.clear();
        }
        prev_row.copy_from_slice(&current_row);
    }
    current_row
}

fn eval_sf(probs_by_chromosome: &[Vec<f64>], overlap_count: usize) -> f64 {
    let joint = joint_logprobs(probs_by_chromosome);
    if overlap_count >= joint.len() { return 0.0; }
    
    let mut logresult = vec![0.0; joint.len()];
    logresult[joint.len() - 1] = joint[joint.len() - 1];
    for i in (0..(joint.len() - 1)).rev() {
        logresult[i] = logaddexp(logresult[i + 1], joint[i]);
    }
    libm::exp(logresult[overlap_count])
}

fn count_overlaps_single_chromosome(r: &[Interval], q: &[Interval]) -> i32 {
    let mut ends = Vec::new();
    for i in r {
        ends.push((i.b, 0, 0));
        ends.push((i.e, 0, 1));
    }
    for i in q {
        ends.push((i.b, 1, 0));
        ends.push((i.e, 1, 1));
    }
    ends.push((i32::MAX, 1, 0));
    ends.sort_by_key(|k| k.0);

    let mut count = 0;
    let mut is_ref_open = false;
    let mut is_query_open = false;
    let mut is_counted = false;
    let mut last_pos = -1;

    for (pos, t, e) in ends {
        if last_pos < pos {
            last_pos = pos;
            if is_ref_open && is_query_open && !is_counted {
                count += 1;
                is_counted = true;
            }
        }
        if t == 0 && e == 0 { is_counted = false; is_ref_open = true; }
        if t == 0 && e == 1 { is_ref_open = false; }
        if t == 1 && e == 0 { is_query_open = true; }
        if t == 1 && e == 1 { is_query_open = false; }
    }
    count
}

fn parse_intervals(text: &str) -> Vec<(String, Interval)> {
    let mut res = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            if let (Ok(b), Ok(e)) = (parts[1].trim().parse::<i32>(), parts[2].trim().parse::<i32>()) {
                if b < e {
                    res.push((parts[0].trim().to_string(), Interval { b, e }));
                }
            }
        }
    }
    res
}

fn parse_sizes(text: &str) -> Vec<(String, i32)> {
    let mut res = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            if let Ok(size) = parts[1].trim().parse::<i32>() {
                res.push((parts[0].trim().to_string(), size));
            }
        }
    }
    res
}

#[wasm_bindgen]
pub fn run_mcdp_analysis(ref_text: &str, query_text: &str, sizes_text: &str) -> String {
    let raw_ref = parse_intervals(ref_text);
    let raw_query = parse_intervals(query_text);
    let sizes = parse_sizes(sizes_text);

    let mut total_overlaps = 0;
    let mut probs_by_chromosome = Vec::new();

    for (chr_name, chr_size) in sizes {
        let r_sub: Vec<Interval> = raw_ref.iter().filter(|k| k.0 == chr_name).map(|k| k.1.clone()).collect();
        let q_sub: Vec<Interval> = raw_query.iter().filter(|k| k.0 == chr_name).map(|k| k.1.clone()).collect();

        if r_sub.is_empty() || q_sub.is_empty() { continue; }

        total_overlaps += count_overlaps_single_chromosome(&r_sub, &q_sub);
        let probs = eval_probs_single_direct_lm_eigen(&r_sub, &q_sub, chr_size);
        probs_by_chromosome.push(probs);
    }

    let p_value = eval_sf(&probs_by_chromosome, total_overlaps as usize);

    format!(
        "Analysis completed successfully (on the Rust Wasm engine)!\n\
         -----------------------------------------\n\
         Actual number of overlaps (k): {}\n\
         Calculated p-value: {:.6e}",
        total_overlaps, p_value
    )
}
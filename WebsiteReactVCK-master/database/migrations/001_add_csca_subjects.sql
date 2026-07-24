-- Update CSCA labels to proper Vietnamese
UPDATE hsk_levels SET label_vi = 'CSCA Toán (数学)'              WHERE code = 'CSCA_MATH';
UPDATE hsk_levels SET label_vi = 'CSCA Vật Lí (物理)'            WHERE code = 'CSCA_PHYSICS';
UPDATE hsk_levels SET label_vi = 'CSCA Hóa Học (化学)'           WHERE code = 'CSCA_CHEMISTRY';
UPDATE hsk_levels SET label_vi = 'CSCA Tiếng Trung Tự Nhiên (汉语自然)' WHERE code = 'CSCA_CHINESE_SCI';
UPDATE hsk_levels SET label_vi = 'CSCA Tiếng Trung Xã Hội (汉语社会)'  WHERE code = 'CSCA_CHINESE_SOC';

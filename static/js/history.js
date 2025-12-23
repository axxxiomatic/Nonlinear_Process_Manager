document.addEventListener('DOMContentLoaded', () => {
    // Выбор города из выпадающего списка для дальнейшего составления прогноза
    const citySelect = document.getElementById('citySelect');
    const cityDropdown = document.getElementById('cityDropdown');

    if (citySelect && cityDropdown) {
        citySelect.addEventListener('click', () => {
            const isOpen = cityDropdown.style.display === 'block';
            cityDropdown.style.display = isOpen ? 'none' : 'block';
        });

        cityDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const text = item.textContent.trim();
                citySelect.innerHTML = text + ' <span class="arrow">▼</span>';
                cityDropdown.style.display = 'none';
                console.log('Выбран город:', text);
            });
        });

        // Закрытие выпадающего списка при клике в другом месте
        document.addEventListener('click', (e) => {
            if (!citySelect.contains(e.target) && !cityDropdown.contains(e.target)) {
                cityDropdown.style.display = 'none';
            }
        });
    }

    const checkbox = document.getElementById('manualAddressCheckbox');
    const inputBlock = document.getElementById('manualAddressInput');
    const addressField = document.getElementById('addressField');

    if (checkbox && inputBlock) {
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                inputBlock.style.display = 'block';
                addressField.focus();
            } else {
                inputBlock.style.display = 'none';
                addressField.value = '';
            }
        });
    }

    if (addressField) {
        addressField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('Введён адрес:', addressField.value);
                // Здесь будет запрос к геокодеру
            }
        });
    }

    // Выбор вещества из выпадающего списка для дальнейшего составления прогноза
    const substanceSelect = document.getElementById('substanceSelect');
    const substanceDropdown = document.getElementById('substanceDropdown');

    if (substanceSelect && substanceDropdown) {
        substanceSelect.addEventListener('click', () => {
            const isOpen = substanceDropdown.style.display === 'block';
            substanceDropdown.style.display = isOpen ? 'none' : 'block';
        });

        substanceDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const text = item.textContent.trim();
                substanceSelect.innerHTML = text + ' <span class="arrow">▼</span>';
                substanceDropdown.style.display = 'none';
                console.log('Выбрано вещество:', text);
            });
        });

        // Закрытие выпадающего списка при клике в другом месте
        document.addEventListener('click', (e) => {
            if (!substanceSelect.contains(e.target) && !substanceDropdown.contains(e.target)) {
                substanceDropdown.style.display = 'none';
            }
        });
    }

    const ctx = document.getElementById('concentrationChart').getContext('2d');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Дек', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг'],
            datasets: [{
                data: [0.0033, 0.0028, 0.0025, 0.0024, 0.0026, 0.0027, 0.0029, 0.0031, 0.0030],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 0.01,
                    ticks: { stepSize: 0.001, callback: value => value.toFixed(6) }
                }
            }
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    
    const slidesContainer = document.querySelector('.carousel-slides');
    const slides = document.querySelectorAll('.carousel-slide');
    const prevButton = document.querySelector('.carousel-prev');
    const nextButton = document.querySelector('.carousel-next');

    if (slidesContainer && slides.length > 0) {
        let currentIndex = 0;
        const totalSlides = slides.length;

        function updateCarousel() {
            slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
        }

        function showNextSlide() {
            currentIndex = (currentIndex + 1) % totalSlides;
            updateCarousel();
        }

        function showPrevSlide() {
            currentIndex = (currentIndex - 1 + totalSlides) % totalSlides;
            updateCarousel();
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                showNextSlide();
                
                clearInterval(autoSlideInterval);
                autoSlideInterval = setInterval(showNextSlide, 5000);
            });
        }

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                showPrevSlide();
                clearInterval(autoSlideInterval);
                autoSlideInterval = setInterval(showNextSlide, 5000);
            });
        }


        let autoSlideInterval = setInterval(showNextSlide, 5000);
    }
});
